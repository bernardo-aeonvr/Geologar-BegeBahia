/**
 * Pop-ups ESPACIAIS: painéis presos a um ponto do panorama (yaw/pitch), dentro da esfera.
 * O visitante olha para eles ou não — como objetos do ambiente, não como HUD. Funcionam em VR.
 *
 *  - O grupo é filho da esfera → gira junto com o initialView.
 *  - Um pop-up = UM painel (âncora). Em sequências, a imagem interna troca com crossfade curto
 *    (camadas sobrepostas no mesmo lugar); nunca há vários slides espalhados.
 *  - QUAL slide aparece vem de fora (motor, a partir de narration.currentTime) — aqui só se desenha.
 *  - Vídeo (ex.: animação com chroma key) fica sincronizado ao relógio da narração a cada frame.
 *  - Texturas pré-carregadas por cena (todas as imagens das sequências) → a troca não pisca.
 *  - Asset ausente (url null) ou falha de carregamento → nada é exibido, sem quebrar o tour.
 */
import {
  Color,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  VideoTexture,
} from "three";
import { createLogger } from "../lib/log";
import type { OverlayCrop } from "../types/tour";
import { directionFromYawPitch, panelWidthForAngle } from "./sphericalCoords";

const log = createLogger("spatial");

/** Distância dos painéis ao centro (a esfera do panorama tem raio 500). */
const DISTANCE = 450;
const SHOW_S = 0.45;
const HIDE_S = 0.35;
/** Crossfade entre slides de uma sequência (s). */
const SLIDE_S = 0.22;
/** Diferença tolerada entre vídeo e narração antes de ressincronizar (s). */
const VIDEO_DRIFT_S = 0.25;

export interface SpatialVideoSpec {
  url: string;
  /** Instante da narração que corresponde a t=0 do vídeo. */
  start: number;
  chromaKey?: string;
}

export interface SpatialOverlaySpec {
  id: string;
  /** Imagem do slide atual (null = asset ausente → não exibe). Ignorado se `video`. */
  url: string | null;
  /** Todas as imagens do pop-up (para pré-carregamento das sequências). */
  preloadUrls?: string[];
  video?: SpatialVideoSpec;
  yaw: number;
  pitch: number;
  /** Largura angular do painel (graus); altura pela proporção da imagem. */
  width: number;
  roll?: number;
  crop?: OverlayCrop;
}

/** Relógio de sincronização (narração) lido a cada frame para os vídeos. */
export interface OverlayClock {
  narrationTime: number | null;
  running: boolean;
}

interface Layer {
  key: string;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  opacity: number;
  target: 0 | 1;
}

interface Item {
  spec: SpatialOverlaySpec;
  group: Group;
  opacity: number;
  target: 0 | 1;
  layers: Layer[];
  /** Chave da camada desejada (url ou vídeo); null = nada. */
  wantKey: string | null;
  loading: string | null;
}

interface TextureUploader {
  initTexture(texture: Texture): void;
  readonly maxAnisotropy: number;
}

interface VideoAsset {
  el: HTMLVideoElement;
  texture: VideoTexture;
  ready: Promise<VideoAsset>;
}

export class SpatialOverlays {
  readonly group = new Group();
  private items = new Map<string, Item>();
  private textures = new Map<string, Promise<Texture>>();
  private videos = new Map<string, VideoAsset>();
  private level = 1;
  private clock: () => OverlayClock = () => ({ narrationTime: null, running: false });

  constructor(
    parent: Object3D,
    private uploader: TextureUploader,
  ) {
    this.group.name = "spatial-overlays";
    parent.add(this.group);
  }

  setClock(clock: () => OverlayClock) {
    this.clock = clock;
  }

  /** Carrega antes as mídias dos pop-ups (todas as imagens das sequências); libera o resto. */
  preload(specs: SpatialOverlaySpec[]) {
    const keep = new Set<string>();
    for (const s of specs) {
      for (const u of s.preloadUrls ?? (s.url ? [s.url] : [])) keep.add(u);
      if (s.video) keep.add(s.video.url);
    }
    for (const it of this.items.values()) for (const l of it.layers) keep.add(l.key);
    for (const [url, p] of this.textures) {
      if (keep.has(url)) continue;
      this.textures.delete(url);
      p.then((t) => t.dispose(), () => {});
    }
    for (const [url, v] of this.videos) {
      if (keep.has(url)) continue;
      this.videos.delete(url);
      disposeVideo(v);
    }
    for (const s of specs) {
      for (const u of s.preloadUrls ?? (s.url ? [s.url] : [])) void this.texture(u).catch(() => {});
      if (s.video) void this.video(s.video.url).ready.catch(() => {});
    }
  }

  /** Pop-ups que devem estar visíveis agora, com o slide atual de cada um. */
  setActive(specs: SpatialOverlaySpec[]) {
    const wanted = new Set(specs.map((s) => s.id));
    for (const it of this.items.values()) if (!wanted.has(it.spec.id)) it.target = 0;
    for (const spec of specs) {
      let it = this.items.get(spec.id);
      if (!it) {
        it = { spec, group: new Group(), opacity: 0, target: 1, layers: [], wantKey: null, loading: null };
        it.group.name = `overlay:${spec.id}`;
        placePanel(it.group, spec);
        this.group.add(it.group);
        this.items.set(spec.id, it);
      }
      it.spec = spec;
      it.target = 1;
      this.want(it, spec.video ? `video:${spec.video.url}` : spec.url);
    }
  }

  /** Escurecimento do fade de cena (0–1), aplicado junto com o panorama. */
  setLevel(level: number) {
    this.level = level;
  }

  /** Chamado a cada frame. */
  update(dt: number) {
    const clock = this.clock();
    for (const [id, it] of this.items) {
      it.opacity = approach(it.opacity, it.target, dt / (it.target ? SHOW_S : HIDE_S));
      for (const l of it.layers) l.opacity = approach(l.opacity, l.target, dt / SLIDE_S);
      // Camadas que já sumiram saem (a de cima termina de aparecer antes de a de baixo sair).
      it.layers = it.layers.filter((l) => {
        if (l.target === 0 && l.opacity <= 0) {
          disposeLayer(it.group, l);
          return false;
        }
        return true;
      });
      for (const l of it.layers) {
        const u = l.mesh.material.uniforms;
        u.opacity.value = it.opacity * l.opacity;
        u.level.value = this.level;
        l.mesh.visible = u.opacity.value > 0.001;
      }
      if (it.spec.video && it.layers.length) this.syncVideo(it.spec.video, clock, it.target === 1);
      if (it.target === 0 && it.opacity <= 0) {
        for (const l of it.layers) disposeLayer(it.group, l);
        this.group.remove(it.group);
        if (it.spec.video) this.videos.get(it.spec.video.url)?.el.pause();
        this.items.delete(id);
      }
    }
  }

  /** Página oculta (sem frames): aplica o estado final na hora. */
  settle() {
    this.update(10);
  }

  clear() {
    for (const it of this.items.values()) {
      for (const l of it.layers) disposeLayer(it.group, l);
      this.group.remove(it.group);
    }
    this.items.clear();
    for (const p of this.textures.values()) p.then((t) => t.dispose(), () => {});
    this.textures.clear();
    for (const v of this.videos.values()) disposeVideo(v);
    this.videos.clear();
  }

  debugInfo() {
    return [...this.items.values()].map((it) => ({
      id: it.spec.id,
      opacity: Number(it.opacity.toFixed(2)),
      target: it.target,
      shown: it.layers.filter((l) => l.target === 1).map((l) => l.key.split("/").pop()),
      layers: it.layers.length,
    }));
  }

  // ───────────────────────── internos ─────────────────────────

  /** Pede a camada `key` para o painel (troca com crossfade quando ficar pronta). */
  private want(it: Item, key: string | null) {
    if (it.wantKey === key) return;
    it.wantKey = key;
    if (key === null) {
      for (const l of it.layers) l.target = 0; // slide sem asset: some, sem placeholder
      return;
    }
    const current = it.layers.find((l) => l.key === key);
    if (current) {
      current.target = 1;
      for (const l of it.layers) if (l !== current) l.target = 0;
      return;
    }
    it.loading = key;
    const spec = it.spec;
    const ready: Promise<Texture> = spec.video
      ? this.video(spec.video.url).ready.then((v) => v.texture)
      : this.texture(key);
    ready.then(
      (tex) => {
        if (it.wantKey !== key || !this.items.has(spec.id)) return; // já mudou de slide/cena
        const layer = createLayer(tex, spec, spec.video?.chromaKey);
        // Primeira camada aparece com o painel; as seguintes fazem crossfade.
        layer.opacity = it.layers.length === 0 ? 1 : 0;
        for (const l of it.layers) l.target = 0;
        it.layers.push(layer);
        it.group.add(layer.mesh);
        it.loading = null;
      },
      (e) => {
        log.warn("asset-failed", { id: spec.id, key, error: String(e) }); // fallback silencioso
        if (it.wantKey === key) for (const l of it.layers) l.target = 0;
      },
    );
  }

  private syncVideo(v: SpatialVideoSpec, clock: OverlayClock, visible: boolean) {
    const asset = this.videos.get(v.url);
    if (!asset || clock.narrationTime === null) return;
    const el = asset.el;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    const target = Math.min(Math.max(clock.narrationTime - v.start, 0), Math.max(0, dur - 0.04));
    if (Math.abs(el.currentTime - target) > VIDEO_DRIFT_S) el.currentTime = target;
    const shouldPlay = visible && clock.running && target < dur - 0.05;
    if (shouldPlay && el.paused) void el.play().catch(() => {});
    if (!shouldPlay && !el.paused) el.pause();
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

  private video(url: string): VideoAsset {
    let v = this.videos.get(url);
    if (!v) {
      v = createVideo(url);
      this.videos.set(url, v);
    }
    return v;
  }
}

// ───────────────────────── helpers ─────────────────────────

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

function placePanel(g: Group, spec: SpatialOverlaySpec) {
  const d = directionFromYawPitch(spec.yaw, spec.pitch);
  g.position.set(d.x * DISTANCE, d.y * DISTANCE, d.z * DISTANCE);
  // Frente do plano (+Z) voltada para o centro, onde está o visitante.
  g.quaternion.setFromRotationMatrix(new Matrix4().lookAt(new Vector3(), g.position, new Vector3(0, 1, 0)));
  if (spec.roll) g.rotateZ((spec.roll * Math.PI) / 180);
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  uniform vec4 uvRect; // x, y, w, h (recorte)
  void main() {
    vUv = uvRect.xy + uv * uvRect.zw;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Imagem exibida como está (só opacidade/fade de cena); chroma key opcional para vídeos. */
const FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D map;
  uniform float opacity;
  uniform float level;
  uniform bool useKey;
  uniform bool decodeSRGB;
  uniform vec3 keyColor;
  void main() {
    vec4 c = texture2D(map, vUv);
    // Texturas de vídeo chegam sem decodificação sRGB pela GPU (as imagens já chegam lineares).
    if (decodeSRGB) c.rgb = mix(c.rgb / 12.92, pow((c.rgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, c.rgb));
    float a = c.a;
    if (useKey) {
      // Chroma key: distância à cor-chave no plano de crominância (CbCr).
      vec2 cc = vec2(dot(c.rgb, vec3(-0.169, -0.331, 0.5)), dot(c.rgb, vec3(0.5, -0.419, -0.081)));
      vec2 kc = vec2(dot(keyColor, vec3(-0.169, -0.331, 0.5)), dot(keyColor, vec3(0.5, -0.419, -0.081)));
      float d = distance(cc, kc);
      a *= smoothstep(0.12, 0.22, d);
      // Remove o verde que vaza nas bordas.
      float spill = max(c.g - max(c.r, c.b), 0.0);
      c.g -= spill * (1.0 - smoothstep(0.12, 0.3, d));
    }
    gl_FragColor = vec4(c.rgb * level, a * opacity);
    #include <colorspace_fragment>
  }
`;

function createLayer(tex: Texture, spec: SpatialOverlaySpec, chromaKey?: string): Layer {
  const img = tex.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  const iw = img.videoWidth || img.width || 16;
  const ih = img.videoHeight || img.height || 9;
  const crop = spec.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = panelWidthForAngle(spec.width, DISTANCE);
  const h = (w * ih * crop.h) / (iw * crop.w); // preserva a proporção da região exibida
  // Texturas com flipY=false (ImageBitmap invertido) usam v de baixo para cima como as demais.
  const uvRect = [crop.x, 1 - crop.y - crop.h, crop.w, crop.h];
  const material = new ShaderMaterial({
    uniforms: {
      map: { value: tex },
      opacity: { value: 0 },
      level: { value: 1 },
      useKey: { value: !!chromaKey },
      decodeSRGB: { value: (tex as VideoTexture).isVideoTexture === true },
      keyColor: { value: new Color(chromaKey ?? "#00ff00") },
      uvRect: { value: uvRect },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.renderOrder = 10; // sempre por cima do panorama
  mesh.visible = false;
  const key = (tex as Texture & { userData: { key?: string } }).userData.key ?? "";
  return { key, mesh, opacity: 0, target: 1 };
}

function disposeLayer(g: Group, l: Layer) {
  g.remove(l.mesh);
  l.mesh.geometry.dispose();
  l.mesh.material.dispose();
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
  texture.userData.key = url;
  texture.needsUpdate = true;
  uploader.initTexture(texture); // upload antecipado: a troca de slide não espera a GPU
  return texture;
}

function createVideo(url: string): VideoAsset {
  const el = document.createElement("video");
  el.crossOrigin = "anonymous";
  el.muted = true; // animação sem som (a faixa do arquivo é silêncio)
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.preload = "auto";
  el.loop = false;
  el.src = url;
  const texture = new VideoTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.userData.key = `video:${url}`;
  const asset = { el, texture } as VideoAsset;
  asset.ready = new Promise<VideoAsset>((resolve, reject) => {
    el.addEventListener("loadeddata", () => resolve(asset), { once: true });
    el.addEventListener("error", () => reject(new Error(`vídeo indisponível: ${url}`)), { once: true });
  });
  el.load();
  return asset;
}

function disposeVideo(v: VideoAsset) {
  v.el.pause();
  v.el.removeAttribute("src");
  v.el.load();
  v.texture.dispose();
}
