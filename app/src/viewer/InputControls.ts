/**
 * Controles de olhar — Pointer Events (mouse, touch e caneta unificados), sem hover.
 *  - arrastar: gira (yaw/pitch)   - pinça (2 dedos) ou roda: zoom (FOV)
 *  - setas / + − no teclado       - inércia leve ao soltar
 */
/** Velocidade máxima da inércia (graus/s). */
const MAX_SPIN = 120;

export interface LookState {
  /** graus; positivo = olhar para a direita */
  lon: number;
  /** graus; positivo = olhar para cima */
  lat: number;
  fov: number;
}

export class InputControls {
  readonly state: LookState = { lon: 0, lat: 0, fov: 75 };
  enabled = true;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; fov: number } | null = null;
  private velocity = { lon: 0, lat: 0 };
  private lastMove = 0;
  private keys = new Set<string>();
  private abort = new AbortController();

  constructor(
    private el: HTMLElement,
    private limits: { fovMin: number; fovMax: number },
  ) {
    const o = { signal: this.abort.signal };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown, o);
    el.addEventListener("pointermove", this.onMove, o);
    el.addEventListener("pointerup", this.onUp, o);
    el.addEventListener("pointercancel", this.onUp, o);
    el.addEventListener("lostpointercapture", this.onUp, o);
    el.addEventListener("wheel", this.onWheel, { ...o, passive: false });
    window.addEventListener("keydown", this.onKey, o);
    window.addEventListener("keyup", (e) => this.keys.delete(e.key), o);
    window.addEventListener("blur", () => this.keys.clear(), o);
  }

  set(view: { yaw?: number; pitch: number; fov: number }) {
    this.state.lon = view.yaw ?? 0;
    this.state.lat = clamp(view.pitch, -85, 85);
    this.state.fov = clamp(view.fov, this.limits.fovMin, this.limits.fovMax);
    this.velocity = { lon: 0, lat: 0 };
  }

  /** Chamado a cada frame. */
  update(dt: number) {
    const s = this.state;
    const k = this.keys;
    const speed = 60 * dt * (s.fov / 75);
    if (k.has("ArrowLeft")) s.lon -= speed;
    if (k.has("ArrowRight")) s.lon += speed;
    if (k.has("ArrowUp")) s.lat += speed;
    if (k.has("ArrowDown")) s.lat -= speed;
    if (this.pointers.size === 0 && (Math.abs(this.velocity.lon) > 0.01 || Math.abs(this.velocity.lat) > 0.01)) {
      s.lon += this.velocity.lon * dt;
      s.lat += this.velocity.lat * dt;
      const decay = Math.pow(0.04, dt); // ~96% de perda por segundo
      this.velocity.lon *= decay;
      this.velocity.lat *= decay;
    }
    s.lat = clamp(s.lat, -85, 85);
    s.lon = ((s.lon % 360) + 540) % 360 - 180;
  }

  dispose() {
    this.abort.abort();
  }

  private degPerPx() {
    return this.state.fov / Math.max(1, this.el.clientHeight);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velocity = { lon: 0, lat: 0 };
    if (this.pointers.size === 2) this.pinchStart = { dist: this.pinchDist(), fov: this.state.fov };
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      const k = this.degPerPx();
      this.state.lon -= dx * k;
      this.state.lat += dy * k;
      const now = performance.now();
      // dt mínimo de 1 frame e velocidade limitada: eventos muito próximos (peteleco rápido,
      // dispositivos com alta taxa de amostragem) não podem gerar um giro descontrolado.
      const dt = Math.max(16, now - this.lastMove) / 1000;
      this.lastMove = now;
      this.velocity = { lon: clamp((-dx * k) / dt, -MAX_SPIN, MAX_SPIN), lat: clamp((dy * k) / dt, -MAX_SPIN, MAX_SPIN) };
    } else if (this.pointers.size === 2 && this.pinchStart) {
      const ratio = this.pinchStart.dist / Math.max(1, this.pinchDist());
      this.state.fov = clamp(this.pinchStart.fov * ratio, this.limits.fovMin, this.limits.fovMax);
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (performance.now() - this.lastMove > 80) this.velocity = { lon: 0, lat: 0 };
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.state.fov = clamp(this.state.fov + e.deltaY * 0.04, this.limits.fovMin, this.limits.fovMax);
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key.startsWith("Arrow")) {
      this.keys.add(e.key);
      e.preventDefault();
    }
    if (e.key === "+" || e.key === "=") this.state.fov = clamp(this.state.fov - 5, this.limits.fovMin, this.limits.fovMax);
    if (e.key === "-") this.state.fov = clamp(this.state.fov + 5, this.limits.fovMin, this.limits.fovMax);
  };

  private pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
