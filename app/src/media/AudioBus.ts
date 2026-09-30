/**
 * AudioBus — roteamento de todo o áudio por um único AudioContext.
 *
 *   <audio narração> ──► ganho narração ─┐
 *   <video A>        ──► ganho ambiente A ├──► master (volume/mute) ──► saída
 *   <video B>        ──► ganho ambiente B ┘
 *
 * Por que Web Audio e não `element.volume`:
 *  - no iOS `element.volume` é somente leitura (sempre 1) → `ambientVolume` não funcionaria;
 *  - rampas de ganho permitem micro-crossfades sem clique na troca de clip.
 * Sem Web Audio disponível, cai para `element.volume`.
 */
import { createLogger } from "../lib/log";

const log = createLogger("audio");

export interface Channel {
  /** Define o ganho (0–1). `rampMs` > 0 faz rampa linear sem clique. */
  set(value: number, rampMs?: number): void;
  readonly value: number;
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;
  private muted = false;
  private fallbackEls: { el: HTMLMediaElement; gain: number }[] = [];
  private unlocked = false;

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      try {
        this.ctx = new Ctor({ latencyHint: "playback" });
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      } catch (e) {
        log.warn("webaudio:unavailable", { error: String(e) });
        this.ctx = null;
      }
    }
  }

  get webAudio(): boolean {
    return this.ctx !== null;
  }

  /** Conecta um elemento de mídia ao bus (uma única vez por elemento). */
  connect(el: HTMLMediaElement, initial = 1): Channel {
    if (this.ctx && this.master) {
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = initial;
      src.connect(gain).connect(this.master);
      const ctx = this.ctx;
      return {
        set(value, rampMs = 0) {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          if (rampMs > 0) {
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(value, now + rampMs / 1000);
          } else {
            gain.gain.setValueAtTime(value, now);
          }
        },
        get value() {
          return gain.gain.value;
        },
      };
    }
    // Fallback sem Web Audio.
    const entry = { el, gain: initial };
    this.fallbackEls.push(entry);
    const apply = () => (el.volume = this.muted ? 0 : Math.min(1, entry.gain * this.volume));
    apply();
    return {
      set: (value) => {
        entry.gain = value;
        apply();
      },
      get value() {
        return entry.gain;
      },
    };
  }

  /**
   * Chamado DENTRO do gesto "Iniciar experiência": retoma o AudioContext e dá `play()` num
   * silêncio curto em cada elemento, liberando-os para tocar depois sem novo gesto (iOS/Quest).
   */
  unlock(elements: HTMLMediaElement[]): void {
    if (this.unlocked) return;
    this.unlocked = true;
    void this.ctx?.resume();
    const silent = silentWavUrl();
    for (const el of elements) {
      try {
        // Elemento já com mídia (ex.: vídeo pré-carregado): só "toca e pausa" o que já tem.
        if (!el.getAttribute("src")) el.src = silent;
        const p = el.play();
        p?.then(() => el.pause()).catch(() => {});
      } catch {
        /* sem problema: o próximo play() tentará de novo */
      }
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch (e) {
        log.warn("webaudio:resume-failed", { error: String(e) });
      }
    }
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }

  get state(): string {
    return this.ctx?.state ?? "no-webaudio";
  }

  private applyMaster() {
    const value = this.muted ? 0 : this.volume;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(value, now + 0.05);
    }
    for (const e of this.fallbackEls) e.el.volume = this.muted ? 0 : Math.min(1, e.gain * this.volume);
  }
}

let silentUrl: string | null = null;
/** WAV PCM de 0,1 s de silêncio (gerado localmente, sem arquivo externo). */
function silentWavUrl(): string {
  if (silentUrl) return silentUrl;
  const rate = 8000;
  const samples = rate / 10;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples * 2, true);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silentUrl;
}
