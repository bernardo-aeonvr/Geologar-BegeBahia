/**
 * VideoController — pool FIXO de 2 elementos <video>, cada um com sua VideoTexture e seu canal
 * de áudio ambiente no AudioBus. Os elementos nunca são recriados (memória/decoder previsíveis).
 *
 *  - Um elemento está ATIVO (exibido); o outro fica livre para PRÉ-CARREGAR o próximo clip da
 *    cena ou, no último clip, o primeiro clip da próxima cena (quem decide é o TourEngine).
 *  - Troca de clip na mesma cena: a textura só troca quando o primeiro quadro do novo clip já
 *    está decodificado; o áudio ambiente faz micro-crossfade (sem fade de imagem).
 *  - `ended` do vídeo apenas INFORMA o motor. O vídeo nunca decide a navegação.
 *  - Elemento que sai de uso é descarregado (removeAttribute('src') + load()) → libera o decoder.
 */
import { LinearFilter, SRGBColorSpace, VideoTexture } from "three";
import { createLogger } from "../lib/log";
import type { TextureHandle, VideoHandlers, VideoPort } from "../tour/ports";
import type { AudioBus, Channel } from "./AudioBus";

const log = createLogger("video");

interface Slot {
  name: "A" | "B";
  el: HTMLVideoElement;
  texture: VideoTexture;
  channel: Channel | null;
  url: string | null;
}

export class VideoController implements VideoPort {
  private slots: [Slot, Slot];
  private active: Slot | null = null;
  private activeIndex = -1;
  /** Listeners do clip ativo. Abortados ao carregar outro clip (evita `ended` duplicado em loops). */
  private clipListeners: AbortController | null = null;

  constructor(
    private bus: AudioBus,
    private crossfadeMs: number,
  ) {
    this.slots = [this.createSlot("A"), this.createSlot("B")];
  }

  private createSlot(name: "A" | "B"): Slot {
    const el = document.createElement("video");
    el.crossOrigin = "anonymous";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.preload = "auto";
    el.loop = false; // loops são decididos pelo motor (sceneRules), não pelo elemento
    (el as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
    const texture = new VideoTexture(el);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    return { name, el, texture, channel: null, url: null };
  }

  /** Elementos para o desbloqueio de autoplay no gesto inicial. */
  get elements(): HTMLVideoElement[] {
    return this.slots.map((s) => s.el);
  }

  /** Conecta os elementos ao AudioBus (uma única vez). */
  attach() {
    for (const s of this.slots) if (!s.channel) s.channel = this.bus.connect(s.el, 0);
  }

  prepare(url: string): void {
    if (this.slots.some((s) => s.url === url)) return;
    const slot = this.freeSlot();
    log.debug("prepare", { slot: slot.name, url });
    this.setSource(slot, url);
  }

  async loadClip(
    index: number,
    url: string,
    opts: { ambientVolume: number; handlers: VideoHandlers; signal: AbortSignal; crossfade: boolean },
  ): Promise<TextureHandle> {
    // Reusa o elemento que já tem a URL (pré-carregado, ou o próprio ativo num loop).
    const slot = this.slots.find((s) => s.url === url) ?? this.freeSlot();
    if (slot.url !== url) this.setSource(slot, url);
    const el = slot.el;

    await waitForData(el, opts.signal);
    if (el.currentTime > 0.01 || el.ended) await seekTo(el, 0, opts.signal);

    const previous = this.active;
    this.active = slot;
    this.activeIndex = index;

    this.clipListeners?.abort();
    const listeners = new AbortController();
    this.clipListeners = listeners;
    opts.signal.addEventListener("abort", () => listeners.abort(), { once: true, signal: listeners.signal });
    el.addEventListener("ended", () => opts.handlers.onClipEnded(index), { signal: listeners.signal });
    el.addEventListener(
      "error",
      () => {
        if (!el.getAttribute("src")) return;
        opts.handlers.onError(index, new Error(`Falha no vídeo (código ${el.error?.code ?? "?"}).`));
      },
      { signal: listeners.signal },
    );

    // Áudio ambiente: novo clip entra de 0 em rampa curta; o anterior sai em rampa curta.
    const target = opts.ambientVolume;
    if (opts.crossfade) {
      slot.channel?.set(0);
      slot.channel?.set(target, this.crossfadeMs);
      if (previous && previous !== slot) previous.channel?.set(0, this.crossfadeMs);
    } else {
      slot.channel?.set(target);
      if (previous && previous !== slot) previous.channel?.set(0);
    }
    if (previous && previous !== slot) previous.el.pause();

    log.debug("clip:loaded", { slot: slot.name, index, url });
    return slot.texture;
  }

  async play(): Promise<void> {
    if (!this.active) return;
    await this.active.el.play();
  }

  pause(): void {
    this.active?.el.pause();
  }

  stop(keepUrl?: string): void {
    this.clipListeners?.abort();
    this.clipListeners = null;
    for (const s of this.slots) {
      s.el.pause();
      s.channel?.set(0);
      if (s.url && s.url !== keepUrl) this.unload(s);
    }
    this.active = null;
    this.activeIndex = -1;
  }

  onTimeReached(clip: number, time: number, cb: () => void, signal: AbortSignal): void {
    // Intervalo (não rAF): continua funcionando com a página oculta, onde rAF para.
    const id = setInterval(() => {
      const a = this.active;
      if (a && this.activeIndex === clip && a.el.currentTime >= time) {
        clearInterval(id);
        cb();
      }
    }, 50);
    signal.addEventListener("abort", () => clearInterval(id), { once: true });
  }

  get currentTime(): number {
    return this.active?.el.currentTime ?? 0;
  }

  get duration(): number {
    return this.active?.el.duration ?? NaN;
  }

  get clipIndex(): number {
    return this.activeIndex;
  }

  debugInfo() {
    return this.slots.map((s) => ({
      slot: s.name,
      active: s === this.active,
      url: s.url ? s.url.split("/").pop() : null,
      readyState: s.el.readyState,
      paused: s.el.paused,
      time: s.el.currentTime,
      buffered: s.el.buffered.length ? s.el.buffered.end(s.el.buffered.length - 1) : 0,
      gain: s.channel?.value ?? 0,
    }));
  }

  private freeSlot(): Slot {
    return this.slots.find((s) => s !== this.active) ?? this.slots[0];
  }

  private setSource(slot: Slot, url: string) {
    slot.el.pause();
    slot.channel?.set(0);
    slot.url = url;
    slot.el.src = url;
    slot.el.load();
  }

  private unload(slot: Slot) {
    log.debug("unload", { slot: slot.name, url: slot.url });
    slot.url = null;
    slot.el.removeAttribute("src");
    slot.el.load();
  }
}

/** Espera o primeiro quadro estar decodificado (readyState ≥ HAVE_CURRENT_DATA). */
function waitForData(el: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    const done = (fn: () => void) => {
      ctl.abort();
      fn();
    };
    el.addEventListener("loadeddata", () => done(resolve), { signal: ctl.signal });
    el.addEventListener("error", () => done(() => reject(new Error(`Falha ao carregar vídeo (código ${el.error?.code ?? "?"}).`))), {
      signal: ctl.signal,
    });
    signal.addEventListener("abort", () => done(() => reject(new DOMException("cena abortada", "AbortError"))), {
      signal: ctl.signal,
    });
  });
}

function seekTo(el: HTMLVideoElement, t: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    el.addEventListener(
      "seeked",
      () => {
        ctl.abort();
        resolve();
      },
      { signal: ctl.signal },
    );
    signal.addEventListener(
      "abort",
      () => {
        ctl.abort();
        reject(new DOMException("cena abortada", "AbortError"));
      },
      { signal: ctl.signal },
    );
    el.currentTime = t;
  });
}
