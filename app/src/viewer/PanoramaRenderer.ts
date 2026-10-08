/**
 * PanoramaRenderer — visualizador 360 em Three.js (sem conhecer o roteiro).
 *
 *  - Esfera invertida com MeshBasicMaterial; textura de imagem OU VideoTexture.
 *  - Fade feito NO WebGL (cor do material → 0): funciona igual dentro do headset (WebXR),
 *    onde overlays DOM não aparecem.
 *  - initialView.yaw gira a ESFERA (não a câmera): o mesmo dado vale no 2D e em VR.
 *  - `setAnimationLoop` desde já (compatível com WebXR). pixelRatio limitado.
 *  - Não descarta texturas que não criou: dono da textura (preloader/vídeo) faz o dispose.
 *  - Pop-ups espaciais (SpatialOverlays) são filhos da esfera: presos ao panorama.
 */
import {
  Color,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import type { TextureHandle, ViewerPort } from "../tour/ports";
import type { InitialView } from "../types/tour";
import { InputControls } from "./InputControls";
import { SpatialOverlays } from "./SpatialOverlays";
import { directionFromYawPitch, sphereRotationForYaw } from "./sphericalCoords";

export interface RendererOptions {
  maxPixelRatio: number;
  fovMin: number;
  fovMax: number;
  enableXR: boolean;
}

interface Fade {
  from: number;
  to: number;
  start: number;
  ms: number;
  resolve: () => void;
  /** Rede de segurança: conclui o fade mesmo se o navegador parar de entregar frames. */
  safety: number;
}

/** Folga além da duração do fade antes da rede de segurança agir (ms). */
const FADE_SAFETY_MARGIN_MS = 250;

export class PanoramaRenderer implements ViewerPort {
  readonly renderer: WebGLRenderer;
  readonly controls: InputControls;
  readonly spatial: SpatialOverlays;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private sphere: Mesh<SphereGeometry, MeshBasicMaterial>;
  private level = 0;
  private fade: Fade | null = null;
  private lastT = 0;
  private resizeObs: ResizeObserver;
  private target = new Vector3();
  private currentKind: "image" | "video" | null = null;

  constructor(
    private container: HTMLElement,
    private opts: RendererOptions,
  ) {
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.xr.enabled = opts.enableXR;
    const canvas = this.renderer.domElement;
    canvas.className = "viewer-canvas";
    canvas.setAttribute("aria-label", "Panorama 360°. Arraste para olhar ao redor.");
    container.appendChild(canvas);

    this.camera = new PerspectiveCamera(75, 1, 0.1, 1100);

    const geometry = new SphereGeometry(500, 96, 64);
    geometry.scale(-1, 1, 1); // vista de dentro
    const material = new MeshBasicMaterial({ color: new Color(0, 0, 0) });
    this.sphere = new Mesh(geometry, material);
    this.scene.add(this.sphere);
    this.spatial = new SpatialOverlays(this.sphere, this);

    this.controls = new InputControls(canvas, { fovMin: opts.fovMin, fovMax: opts.fovMax });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
    // Página oculta = sem requestAnimationFrame. O áudio segue tocando em segundo plano, então um
    // fade em andamento termina na hora (ninguém o vê) para o tour não parar no meio da transição.
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.finishFade();
      this.spatial.settle();
    }
  };

  get maxTextureSize(): number {
    return this.renderer.capabilities.maxTextureSize;
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  initTexture(texture: Texture) {
    this.renderer.initTexture(texture);
  }

  showTexture(texture: TextureHandle, kind: "image" | "video"): void {
    const mat = this.sphere.material;
    if (mat.map !== texture) {
      mat.map = texture as Texture;
      mat.needsUpdate = true;
    }
    this.currentKind = kind;
  }

  clear(): void {
    this.cancelFade();
    this.level = 0;
    this.applyLevel();
    this.sphere.material.map = null;
    this.sphere.material.needsUpdate = true;
    this.currentKind = null;
    this.spatial.clear();
  }

  applyInitialView(view: InitialView): void {
    // Com a geometria espelhada, o centro da equiretangular (u = 0,5) fica em −X; −90° o traz para
    // a frente (−Z). Somar o yaw traz para a frente o ponto `yaw` graus à direita do centro.
    this.sphere.rotation.y = sphereRotationForYaw(view.yaw);
    this.controls.set({ yaw: 0, pitch: view.pitch, fov: view.fov });
  }

  /** 0 = preto, 1 = normal; valores intermediários escurecem (ex.: prévia da tela inicial). */
  fadeTo(level: number, ms: number): Promise<void> {
    this.cancelFade();
    if (ms <= 0 || this.level === level || document.hidden) {
      this.level = level;
      this.applyLevel();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // requestAnimationFrame pode parar sem aviso (janela coberta, painel oculto, economia de
      // energia) — sem esta rede o tour ficaria preso no meio da transição.
      const safety = window.setTimeout(() => this.finishFade(), ms + FADE_SAFETY_MARGIN_MS);
      this.fade = { from: this.level, to: level, start: performance.now(), ms, resolve, safety };
    });
  }

  get kind() {
    return this.currentKind;
  }

  /** Projeta yaw/pitch da imagem para coordenadas de tela (hotspots). null = atrás da câmera. */
  project(yaw: number, pitch: number): { x: number; y: number } | null {
    const d = directionFromYawPitch(yaw, pitch);
    const v = new Vector3(d.x, d.y, d.z).multiplyScalar(400).applyMatrix4(this.sphere.matrixWorld);
    v.project(this.camera);
    if (v.z > 1) return null;
    const { clientWidth: w, clientHeight: h } = this.container;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /**
   * Entra em VR imersivo. DEVE ser chamado dentro do gesto do usuário (clique/toque):
   * `requestSession` é disparado de forma síncrona, antes de qualquer await.
   * Espaço de referência "local": a cabeça fica no centro da esfera (certo para 360°).
   */
  enterXR(onEnd?: () => void): Promise<void> {
    if (!this.opts.enableXR || !navigator.xr) return Promise.reject(new Error("WebXR indisponível"));
    const request = navigator.xr.requestSession("immersive-vr");
    return request.then(async (session) => {
      session.addEventListener("end", () => onEnd?.(), { once: true });
      this.renderer.xr.setReferenceSpaceType("local");
      await this.renderer.xr.setSession(session);
    });
  }

  get inXR(): boolean {
    return this.renderer.xr.isPresenting;
  }

  /** Sai do VR imersivo (se estiver nele). */
  exitXR(): Promise<void> {
    const session = this.renderer.xr.getSession();
    return session ? session.end().catch(() => {}) : Promise.resolve();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.spatial.clear();
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private tick = (t: number) => {
    const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0;
    this.lastT = t;

    if (this.fade) {
      const f = this.fade;
      const k = Math.min(1, (performance.now() - f.start) / f.ms);
      const eased = k * k * (3 - 2 * k);
      this.level = f.from + (f.to - f.from) * eased;
      this.applyLevel();
      if (k >= 1) this.cancelFade();
    }

    if (!this.renderer.xr.isPresenting) {
      this.controls.update(dt);
      const s = this.controls.state;
      const aspect = this.camera.aspect;
      // Retrato: amplia o FOV vertical para o campo horizontal não ficar apertado.
      const vfov = aspect >= 1 ? s.fov : Math.min(this.opts.fovMax + 15, s.fov * (1 + (1 - aspect) * 0.5));
      if (Math.abs(this.camera.fov - vfov) > 0.01) {
        this.camera.fov = vfov;
        this.camera.updateProjectionMatrix();
      }
      const lat = MathUtils.degToRad(s.lat);
      const lon = MathUtils.degToRad(s.lon);
      this.target.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat));
      this.camera.lookAt(this.target);
    }
    this.spatial.update(dt); // também em VR
    this.renderer.render(this.scene, this.camera);
  };

  private applyLevel() {
    this.sphere.material.color.setScalar(this.level);
    this.spatial.setLevel(this.level);
  }

  private finishFade() {
    if (!this.fade) return;
    this.level = this.fade.to;
    this.applyLevel();
    this.cancelFade();
  }

  private cancelFade() {
    if (this.fade) {
      const f = this.fade;
      this.fade = null;
      window.clearTimeout(f.safety);
      f.resolve();
    }
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
