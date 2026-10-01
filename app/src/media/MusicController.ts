/**
 * MusicController — música de fundo contínua com ducking.
 *
 *  - Um <audio> próprio, ligado ao AudioBus (respeita volume/mudo geral) com um ganho dedicado.
 *  - Não reinicia a cada cena: toca o tour inteiro, em loop.
 *  - Loop manual em `loopEnd` (corta o silêncio do fim do arquivo).
 *  - Ducking por rampas de ganho (sem clique): abaixa em `attackMs` quando o narrador começa,
 *    volta em `releaseMs` quando ele para. Pausar o tour faz a música sair em fade e pausar.
 */
import { createLogger } from "../lib/log";
import type { MusicConfig } from "../types/tour";
import type { AudioBus, Channel } from "./AudioBus";
import { dbToGain, type MusicTarget } from "./musicRules";

const log = createLogger("music");
const STOP_FADE_MS = 500;

export class MusicController {
  readonly el: HTMLAudioElement;
  private channel: Channel | null = null;
  private current: MusicTarget = { playing: false, ducked: false };
  private pauseTimer = 0;

  constructor(
    private bus: AudioBus,
    private cfg: MusicConfig,
    url: string,
  ) {
    const el = document.createElement("audio");
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.loop = !cfg.loopEnd; // com loopEnd o loop é manual (abaixo)
    el.src = url;
    if (cfg.loopEnd) {
      el.addEventListener("timeupdate", () => {
        if (el.currentTime >= cfg.loopEnd!) el.currentTime = 0;
      });
      el.addEventListener("ended", () => {
        el.currentTime = 0;
        if (this.current.playing) void el.play().catch(() => {});
      });
    }
    el.addEventListener("error", () => log.warn("load-failed", { code: el.error?.code }));
    this.el = el;
  }

  attach() {
    if (!this.channel) this.channel = this.bus.connect(this.el, 0);
  }

  /** Aplica o alvo (tocar/abaixar/parar) com rampas suaves. Idempotente. */
  apply(target: MusicTarget) {
    const prev = this.current;
    this.current = target;
    window.clearTimeout(this.pauseTimer);

    if (!target.playing) {
      if (!prev.playing) return;
      this.channel?.set(0, STOP_FADE_MS);
      this.pauseTimer = window.setTimeout(() => {
        if (!this.current.playing) this.el.pause();
      }, STOP_FADE_MS);
      return;
    }

    const gain = dbToGain(target.ducked ? this.cfg.duckedGainDb : this.cfg.gainDb);
    const ramp = !prev.playing ? this.cfg.releaseMs : target.ducked ? this.cfg.attackMs : this.cfg.releaseMs;
    if (this.el.paused) {
      this.el.play().catch((e: unknown) => log.warn("play-blocked", { error: String(e) }));
    }
    if (prev.playing !== target.playing || prev.ducked !== target.ducked) this.channel?.set(gain, ramp);
  }

  debugInfo() {
    return {
      playing: !this.el.paused,
      ducked: this.current.ducked,
      time: Number(this.el.currentTime.toFixed(1)),
      gain: Number((this.channel?.value ?? 0).toFixed(2)),
    };
  }

  dispose() {
    window.clearTimeout(this.pauseTimer);
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
  }
}
