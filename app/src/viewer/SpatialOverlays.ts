/**
 * Pop-ups ESPACIAIS: painéis presos a um ponto do panorama (yaw/pitch), dentro da esfera.
 * O visitante olha para eles ou não — como objetos do ambiente, não como HUD.
 * Funcionam igual em VR (WebXR), onde HUD em HTML nem aparece.
 *
 *  - O grupo é filho da esfera → gira junto com o initialView.
 *  - Cada painel olha para o centro (posição do visitante), com perspectiva natural.
 *  - Entrada/saída por opacidade; o fade de cena escurece os painéis junto com o panorama.
 *  - Texturas carregadas antes (preload por cena) e descartadas ao trocar de cena.
 */
import {
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { createLogger } from "../lib/log";
import { directionFromYawPitch, panelWidthForAngle } from "./sphericalCoords";

const log = createLogger("spatial");

/** Distância dos painéis ao centro (a esfera do panorama tem raio 500). */
const DISTANCE = 450;
const FADE_IN_S = 0.45;
const FADE_OUT_S = 0.35;

export interface SpatialOverlaySpec {
  id: string;
  url: string;
  yaw: number;
  pitch: number;
  /** Largura angular do painel (graus). */
  width: number;
  /** Inclinação do painel no próprio plano (graus). */
  roll?: number;
}

interface Item {
  spec: SpatialOverlaySpec;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  opacity: number;
  target: 0 | 1;
}

interface TextureUploader {
  initTexture(texture: Texture): void;
  readonly maxAnisotropy: number;
}

export class SpatialOverlays {
  readonly group = new Group();
  private items = new Map<string, Item>();
  private textures = new Map<string, Promise<Texture>>();
  private wanted = new Set<string>();
  private level = 1;

  constructor(
    parent: Object3D,
    private uploader: TextureUploader,
  ) {
    this.group.name = "spatial-overlays";
    parent.add(this.group);
  }

  /** Carrega antes as texturas dos pop-ups da cena; libera as que não serão mais usadas. */
  preload(specs: SpatialOverlaySpec[]) {
    const keep = new Set(specs.map((s) => s.url));
    for (const it of this.items.values()) keep.add(it.spec.url);
    for (const [url, p] of this.textures) {
      if (keep.has(url)) continue;
      this.textures.delete(url);
      p.then((t) => t.dispose(), () => {});
    }
    for (const s of specs) void this.texture(s.url).catch(() => {});
  }

  /** Define quais pop-ups devem estar visíveis agora (os demais saem com fade). */
  setActive(specs: SpatialOverlaySpec[]) {
    this.wanted = new Set(specs.map((s) => s.id));
    for (const it of this.items.values()) it.target = this.wanted.has(it.spec.id) ? 1 : 0;
    for (const spec of specs) {
      if (this.items.has(spec.id)) continue;
      this.texture(spec.url).then(
        (tex) => {
          if (!this.wanted.has(spec.id) || this.items.has(spec.id)) return;
          this.items.set(spec.id, this.createItem(spec, tex));
        },
        (e) => log.warn("texture-failed", { id: spec.id, error: String(e) }),
      );
    }
  }

  /** Escurecimento do fade de cena (0–1), aplicado junto com o panorama. */
  setLevel(level: number) {
    this.level = level;
    for (const it of this.items.values()) it.mesh.material.color.setScalar(level);
  }

  /** Chamado a cada frame. */
  update(dt: number) {
    for (const [id, it] of this.items) {
      const speed = it.target === 1 ? 1 / FADE_IN_S : 1 / FADE_OUT_S;
      it.opacity += Math.sign(it.target - it.opacity) * Math.min(Math.abs(it.target - it.opacity), speed * dt);
      it.mesh.material.opacity = it.opacity;
      it.mesh.visible = it.opacity > 0.001;
      if (it.target === 0 && it.opacity <= 0) {
        this.group.remove(it.mesh);
        it.mesh.geometry.dispose();
        it.mesh.material.dispose();
        this.items.delete(id);
      }
    }
  }

  /** Página oculta (sem frames): aplica o estado final na hora. */
  settle() {
    this.update(10);
  }

  clear() {
    this.wanted.clear();
    for (const it of this.items.values()) {
      this.group.remove(it.mesh);
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
    }
    this.items.clear();
    for (const p of this.textures.values()) p.then((t) => t.dispose(), () => {});
    this.textures.clear();
  }

  debugInfo() {
    return [...this.items.values()].map((it) => ({ id: it.spec.id, opacity: Number(it.opacity.toFixed(2)), target: it.target }));
  }

  private createItem(spec: SpatialOverlaySpec, tex: Texture): Item {
    const img = tex.image as { width: number; height: number };
    const w = panelWidthForAngle(spec.width, DISTANCE);
    const h = (w * img.height) / img.width;
    const material = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    material.color.setScalar(this.level);
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    mesh.name = `overlay:${spec.id}`;
    mesh.renderOrder = 10; // sempre por cima do panorama
    const d = directionFromYawPitch(spec.yaw, spec.pitch);
    mesh.position.set(d.x * DISTANCE, d.y * DISTANCE, d.z * DISTANCE);
    // Frente do plano (+Z) voltada para o centro, onde está o visitante.
    mesh.quaternion.setFromRotationMatrix(new Matrix4().lookAt(new Vector3(), mesh.position, new Vector3(0, 1, 0)));
    if (spec.roll) mesh.rotateZ((spec.roll * Math.PI) / 180);
    mesh.visible = false;
    this.group.add(mesh);
    log.debug("show", { id: spec.id, yaw: spec.yaw, pitch: spec.pitch });
    return { spec, mesh, opacity: 0, target: 1 };
  }

  private texture(url: string): Promise<Texture> {
    let p = this.textures.get(url);
    if (!p) {
      p = loadTexture(url, this.uploader);
      this.textures.set(url, p);
      p.catch(() => this.textures.delete(url));
    }
    return p;
  }
}

async function loadTexture(url: string, uploader: TextureUploader): Promise<Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const blob = await res.blob();
  let texture: Texture;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    texture = new Texture(bitmap);
    texture.flipY = false;
  } catch {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
    await img.decode();
    URL.revokeObjectURL(objectUrl);
    texture = new Texture(img);
  }
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = Math.min(8, uploader.maxAnisotropy);
  texture.needsUpdate = true;
  uploader.initTexture(texture);
  return texture;
}
