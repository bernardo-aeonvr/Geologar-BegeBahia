/**
 * Implementações falsas das portas do motor: registram chamadas e permitem disparar eventos
 * (fim de narração, fim de clip) de forma determinística.
 */
import { createLogger, setLogLevel } from "../src/lib/log";
import type {
  AudioPort,
  NarrationHandlers,
  NarrationPort,
  PreloaderPort,
  TextureHandle,
  VideoHandlers,
  VideoPort,
  ViewerPort,
} from "../src/tour/ports";
import { TourEngine } from "../src/tour/TourEngine";
import { createTourStore } from "../src/tour/tourStore";
import type { TourDefinition } from "../src/types/tour";

export class FakeNarration implements NarrationPort {
  state: "idle" | "playing" | "paused" | "stopped" = "idle";
  url: string | null = null;
  handlers: NarrationHandlers | null = null;
  /** Todos os handlers já registrados (inclusive de cenas antigas) — para simular eventos atrasados. */
  history: { url: string; handlers: NarrationHandlers }[] = [];
  currentTime = 0;
  duration = NaN;
  starts = 0;
  rejectNext: Error | null = null;

  async start(url: string, handlers: NarrationHandlers, signal: AbortSignal) {
    this.starts++;
    this.url = url;
    this.handlers = handlers;
    this.history.push({ url, handlers });
    this.currentTime = 0;
    signal.addEventListener("abort", () => {
      if (this.handlers === handlers) this.handlers = null;
    });
    if (this.rejectNext) {
      const e = this.rejectNext;
      this.rejectNext = null;
      this.state = "paused";
      throw e;
    }
    this.state = "playing";
  }
  pause() {
    if (this.state === "playing") this.state = "paused";
  }
  async resume() {
    if (this.state === "paused") this.state = "playing";
  }
  stop() {
    this.state = "stopped";
    this.handlers = null;
  }
  remaining() {
    return Number.isFinite(this.duration) ? Math.max(0, this.duration - this.currentTime) : null;
  }
  /** Simula o evento real `ended`. */
  end() {
    this.state = "idle";
    this.handlers?.onEnded();
  }
}

export class FakeVideo implements VideoPort {
  playing = false;
  active: { index: number; url: string; handlers: VideoHandlers } | null = null;
  loads: { index: number; url: string; crossfade: boolean }[] = [];
  prepared: string[] = [];
  stops: (string | undefined)[] = [];
  history: { index: number; handlers: VideoHandlers }[] = [];
  currentTime = 0;
  duration = NaN;
  timeWatchers: { clip: number; time: number; cb: () => void }[] = [];

  prepare(url: string) {
    this.prepared.push(url);
  }
  async loadClip(index: number, url: string, opts: { handlers: VideoHandlers; signal: AbortSignal; crossfade: boolean }) {
    this.loads.push({ index, url, crossfade: opts.crossfade });
    const entry = { index, url, handlers: opts.handlers };
    this.active = entry;
    this.history.push({ index, handlers: opts.handlers });
    this.playing = false;
    this.currentTime = 0;
    opts.signal.addEventListener("abort", () => {
      if (this.active === entry) this.active = null;
    });
    return { video: url } as TextureHandle;
  }
  async play() {
    if (this.active) this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  stop(keepUrl?: string) {
    this.stops.push(keepUrl);
    this.playing = false;
    this.active = null;
  }
  onTimeReached(clip: number, time: number, cb: () => void) {
    this.timeWatchers.push({ clip, time, cb });
  }
  /** Simula o evento real `ended` do clip ativo. */
  endClip() {
    const a = this.active;
    if (!a) throw new Error("nenhum clip ativo");
    this.playing = false;
    a.handlers.onClipEnded(a.index);
  }
}

export class FakeViewer implements ViewerPort {
  shown: { texture: TextureHandle; kind: string }[] = [];
  level = 0;
  fades: number[] = [];
  views: unknown[] = [];
  showTexture(texture: TextureHandle, kind: "image" | "video") {
    this.shown.push({ texture, kind });
  }
  clear() {
    this.level = 0;
    this.shown.push({ texture: null, kind: "clear" });
  }
  applyInitialView(v: unknown) {
    this.views.push(v);
  }
  async fadeTo(level: 0 | 1) {
    this.fades.push(level);
    this.level = level;
  }
}

export class FakePreloader implements PreloaderPort {
  panoramas: string[] = [];
  narrations: string[] = [];
  retained: string[][] = [];
  cleared = 0;
  failPanorama = new Set<string>();
  async loadPanorama(id: string) {
    this.panoramas.push(id);
    if (this.failPanorama.has(id)) throw new Error(`falha ao carregar ${id}`);
    return { image: id };
  }
  async loadNarration(id: string) {
    this.narrations.push(id);
    return `blob:${id}`;
  }
  retain(ids: string[]) {
    this.retained.push(ids);
  }
  clear() {
    this.cleared++;
  }
}

export class FakeAudio implements AudioPort {
  volume = 1;
  muted = false;
  setVolume(v: number) {
    this.volume = v;
  }
  setMuted(m: boolean) {
    this.muted = m;
  }
  async resume() {}
}

setLogLevel(false);

export function createHarness(tour: TourDefinition, opts: { loopMinNarrationRemaining?: number } = {}) {
  const narration = new FakeNarration();
  const video = new FakeVideo();
  const viewer = new FakeViewer();
  const preloader = new FakePreloader();
  const audio = new FakeAudio();
  const store = createTourStore();
  const scheduled: { fn: () => void; ms: number }[] = [];
  const logs: { event: string; data?: Record<string, unknown> }[] = [];
  const base = createLogger("test");
  const log = {
    ...base,
    info: (event: string, data?: Record<string, unknown>) => logs.push({ event, data }),
    debug: (event: string, data?: Record<string, unknown>) => logs.push({ event, data }),
  };
  const engine = new TourEngine({
    tour,
    store,
    narration,
    video,
    viewer,
    preloader,
    audio,
    resolveUrl: (id) => `media/${id}.mp4`,
    config: { fadeInMs: 0, fadeOutMs: 0, loopMinNarrationRemaining: opts.loopMinNarrationRemaining ?? 1 },
    log,
    schedule: (fn, ms) => {
      scheduled.push({ fn, ms });
      return () => {};
    },
    interval: () => () => {},
  });
  return { engine, narration, video, viewer, preloader, audio, store, scheduled, logs };
}

/** Deixa promessas pendentes do motor se resolverem. */
export async function flush(times = 8) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}
