/**
 * NarrationController — um ÚNICO elemento <audio> reutilizado durante todo o tour.
 *
 *  - Trocar de cena troca só o `src` (blob pré-carregado): é impossível tocarem duas narrações.
 *  - Listeners registrados com o AbortSignal da cena: abortar a cena remove todos.
 *  - O término vem do evento REAL `ended`. Nada de timers pela duração.
 *  - Watchdog de travamento: sem progresso por `stallMs` estando em reprodução → onStall(true).
 *    Não avança o tour; só permite ao usuário tentar de novo ou seguir sem narração.
 */
import { createLogger } from "../lib/log";
import type { NarrationHandlers, NarrationPort } from "../tour/ports";
import type { AudioBus, Channel } from "./AudioBus";

const log = createLogger("narration");

export class NarrationController implements NarrationPort {
  readonly el: HTMLAudioElement;
  private channel: Channel | null = null;

  constructor(
    private bus: AudioBus,
    private stallMs: number,
  ) {
    this.el = document.createElement("audio");
    this.el.preload = "auto";
    this.el.crossOrigin = "anonymous";
    this.el.setAttribute("playsinline", "");
  }

  /** Conecta ao AudioBus (depois do gesto inicial). */
  attach() {
    if (!this.channel) this.channel = this.bus.connect(this.el, 1);
  }

  async start(url: string, h: NarrationHandlers, signal: AbortSignal): Promise<void> {
    const el = this.el;
    el.pause();
    if (el.src !== url) el.src = url;
    el.currentTime = 0;

    const opts = { signal };
    el.addEventListener("ended", () => h.onEnded(), opts);
    el.addEventListener(
      "error",
      () => {
        if (!el.getAttribute("src")) return; // descarregado de propósito
        const code = el.error?.code;
        h.onError(new Error(`Falha ao carregar a narração (código ${code ?? "?"}).`));
      },
      opts,
    );

    // Watchdog de travamento (detecção, não navegação).
    let lastTime = -1;
    let lastProgressAt = performance.now();
    let stalled = false;
    const check = setInterval(() => {
      if (el.paused || el.ended) {
        lastProgressAt = performance.now();
        return;
      }
      if (el.currentTime !== lastTime) {
        lastTime = el.currentTime;
        lastProgressAt = performance.now();
        if (stalled) {
          stalled = false;
          h.onStall(false);
        }
      } else if (!stalled && performance.now() - lastProgressAt > this.stallMs) {
        stalled = true;
        log.warn("stalled", { src: el.currentSrc, t: el.currentTime });
        h.onStall(true);
      }
    }, 1000);
    signal.addEventListener("abort", () => clearInterval(check), { once: true });

    await el.play();
  }

  pause() {
    this.el.pause();
  }

  async resume() {
    if (this.el.getAttribute("src") && !this.el.ended) await this.el.play();
  }

  stop() {
    const el = this.el;
    el.pause();
    if (el.getAttribute("src")) {
      el.removeAttribute("src");
      el.load();
    }
  }

  get currentTime() {
    return this.el.currentTime;
  }

  get duration() {
    return this.el.duration;
  }

  remaining(): number | null {
    const d = this.el.duration;
    return Number.isFinite(d) ? Math.max(0, d - this.el.currentTime) : null;
  }

  get state(): string {
    const el = this.el;
    if (!el.getAttribute("src")) return "idle";
    if (el.error) return "error";
    if (el.ended) return "ended";
    return el.paused ? "paused" : "playing";
  }
}
