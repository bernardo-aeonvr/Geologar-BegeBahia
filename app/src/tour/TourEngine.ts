/**
 * TourEngine — orquestração do tour.
 *
 *   start() → goTo(cena) → carrega panorama/vídeo → fade-in → narração (+ vídeo)
 *           → evento REAL de término (narração `ended`, clip `ended`)
 *           → sceneRules decide (avançar / esperar / próximo clip / loop / congelar)
 *           → goTo(próxima) … → créditos → conclusão
 *
 * Garantias:
 *  - Nenhum timer baseado em duração de áudio: só eventos reais das mídias.
 *  - Cada cena tem `token` + AbortController. Sair da cena aborta todos os listeners; qualquer
 *    evento que ainda chegue com token antigo é ignorado (e registrado no log).
 *  - Uma transição por vez. Pedidos automáticos durante a transição são ignorados; pedidos
 *    manuais guardam só o último destino e são aplicados ao fim da transição.
 *  - Nenhuma regra por id de cena: o comportamento vem de `TourScene`.
 */
import type { Logger } from "../lib/log";
import type { TourAction, TourDefinition, TourScene, VideoSceneMedia } from "../types/tour";
import type { AudioPort, NarrationPort, PreloaderPort, TextureHandle, VideoPort, ViewerPort } from "./ports";
import {
  activeCueOverlays,
  createVideoRuntime,
  decideOnClipEnded,
  decideOnNarrationEnded,
  isVideo,
  type SceneDecision,
  type SceneRuntimeView,
  type VideoRuntime,
} from "./sceneRules";
import type { ErrorKind, TourStore } from "./tourStore";

export type NavReason = "start" | "auto" | "manual" | "restart" | "retry";

export interface EngineConfig {
  fadeOutMs: number;
  fadeInMs: number;
  loopMinNarrationRemaining: number;
}

export interface EngineDeps {
  tour: TourDefinition;
  store: TourStore;
  narration: NarrationPort;
  video: VideoPort;
  viewer: ViewerPort;
  preloader: PreloaderPort;
  audio: AudioPort;
  /** id lógico de mídia → URL (MediaResolver). */
  resolveUrl(id: string): string;
  config: EngineConfig;
  log: Logger;
  /** Agendador para temporizações de UI (créditos, polling de cues). Injetável nos testes. */
  schedule?: (fn: () => void, ms: number) => () => void;
  interval?: (fn: () => void, ms: number) => () => void;
}

interface SceneRuntime {
  token: number;
  scene: TourScene;
  abort: AbortController;
  narrationUrl: string | null;
  narrationStarted: boolean;
  narrationFinished: boolean;
  exitRequested: boolean;
  /** Já pediu para sair (impede avanço duplo). */
  exiting: boolean;
  /** Clip carregado durante a pausa: tocar ao retomar. */
  playOnResume: boolean;
  video: VideoRuntime | null;
}

class StaleSceneError extends Error {}

export class TourEngine {
  private token = 0;
  private rt: SceneRuntime | null = null;
  private transitioning = false;
  private pendingTarget: string | null = null;
  private hasShownScene = false;
  private stopCues: (() => void) | null = null;
  private readonly scenes = new Map<string, TourScene>();
  private readonly order: string[];
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly interval: (fn: () => void, ms: number) => () => void;

  constructor(private readonly d: EngineDeps) {
    for (const s of d.tour.scenes) this.scenes.set(s.id, s);
    this.order = d.tour.scenes.map((s) => s.id);
    this.schedule =
      d.schedule ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });
    this.interval =
      d.interval ??
      ((fn, ms) => {
        const id = setInterval(fn, ms);
        return () => clearInterval(id);
      });
    d.store.set({ sceneCount: this.order.length });
  }

  // ───────────────────────────── API pública ─────────────────────────────

  start(): Promise<void> {
    return this.goTo(this.d.tour.firstScene, "start");
  }

  /** Próxima cena (manual): não espera vídeo nem narração. */
  next(): Promise<void> {
    const cur = this.rt?.scene;
    if (!cur) return Promise.resolve();
    if (cur.next) return this.goTo(cur.next, "manual");
    this.finishTour(this.rt!);
    return Promise.resolve();
  }

  prev(): Promise<void> {
    const cur = this.rt?.scene;
    if (!cur) return Promise.resolve();
    const i = this.order.indexOf(cur.id);
    return i > 0 ? this.goTo(this.order[i - 1], "manual") : this.goTo(cur.id, "manual");
  }

  goToScene(id: string): Promise<void> {
    return this.goTo(id, "manual");
  }

  pause(): void {
    const rt = this.rt;
    if (!rt || this.d.store.get().phase !== "playing") return;
    if (rt.narrationStarted && !rt.narrationFinished) this.d.narration.pause();
    this.d.video.pause();
    this.d.store.set((s) => ({ phase: "paused", narration: s.narration === "playing" ? "paused" : s.narration }));
    this.d.log.info("tour:pause", { scene: rt.scene.id });
  }

  async resume(): Promise<void> {
    const rt = this.rt;
    if (!rt || this.d.store.get().phase !== "paused") return;
    this.d.store.set((s) => ({ phase: "playing", narration: s.narration === "paused" ? "playing" : s.narration }));
    await this.d.audio.resume();
    await this.resumeMedia(rt);
    this.d.log.info("tour:resume", { scene: rt.scene.id });
  }

  togglePause(): Promise<void> {
    const phase = this.d.store.get().phase;
    if (phase === "playing") {
      this.pause();
      return Promise.resolve();
    }
    if (phase === "paused") return this.resume();
    if (this.d.store.get().error?.kind === "autoplay") return this.unblockAutoplay();
    return Promise.resolve();
  }

  setVolume(v: number): void {
    const volume = Math.min(1, Math.max(0, v));
    this.d.audio.setVolume(volume);
    this.d.store.set({ volume, muted: volume === 0 ? true : false });
    this.d.audio.setMuted(volume === 0);
  }

  toggleMute(): void {
    const muted = !this.d.store.get().muted;
    this.d.audio.setMuted(muted);
    this.d.store.set({ muted });
  }

  /** "Recomeçar": limpa estado, para áudio/vídeo, descarta mídia e volta limpo à primeira cena. */
  async restart(): Promise<void> {
    this.d.log.info("tour:restart");
    this.invalidateCurrentScene();
    this.transitioning = false;
    this.pendingTarget = null;
    this.d.narration.stop();
    this.d.video.stop();
    this.d.preloader.clear();
    this.d.viewer.clear();
    this.hasShownScene = false;
    const { volume, muted } = this.d.store.get();
    this.d.store.reset();
    this.d.store.set({ volume, muted, sceneCount: this.order.length });
    await this.goTo(this.d.tour.firstScene, "restart");
  }

  /** Ação do painel de erro "Tentar novamente". */
  async retry(): Promise<void> {
    const rt = this.rt;
    const err = this.d.store.get().error;
    if (!rt || !err) return;
    this.d.log.info("tour:retry", { kind: err.kind, scene: rt.scene.id });
    if (err.kind === "narration" || err.kind === "narration-stalled") {
      this.d.store.set({ error: null, phase: "playing" });
      if (rt.narrationUrl) await this.startNarration(rt, rt.narrationUrl);
      return;
    }
    if (err.kind === "autoplay") return this.unblockAutoplay();
    await this.goTo(rt.scene.id, "retry");
  }

  /** Narração falhou: segue a cena como se ela tivesse terminado. */
  continueWithoutNarration(): void {
    const rt = this.rt;
    if (!rt) return;
    this.d.narration.stop();
    this.d.store.set({ error: null, phase: "playing" });
    this.onNarrationFinished(rt, "skipped");
  }

  /** Gesto do usuário depois de o navegador bloquear o autoplay. */
  async unblockAutoplay(): Promise<void> {
    const rt = this.rt;
    if (!rt) return;
    this.d.store.set({ error: null, phase: "playing" });
    await this.d.audio.resume();
    // Bloqueio antes da narração começar (ex.: play() do vídeo recusado) → inicia a mídia da cena do zero.
    if (!rt.narrationStarted && !rt.narrationFinished) await this.startSceneMedia(rt);
    else await this.resumeMedia(rt, true);
  }

  runAction(action: TourAction): void {
    switch (action.type) {
      case "goToScene":
        void this.goTo(action.sceneId, "manual");
        break;
      case "showOverlay":
        this.d.store.set((s) =>
          s.activeOverlays.includes(action.overlayId) ? {} : { activeOverlays: [...s.activeOverlays, action.overlayId] },
        );
        break;
      case "hideOverlay":
        this.d.store.set((s) => ({ activeOverlays: s.activeOverlays.filter((o) => o !== action.overlayId) }));
        break;
      default:
        this.d.log.info("action:unhandled", { action });
    }
  }

  get currentScene(): TourScene | null {
    return this.rt?.scene ?? null;
  }

  getScene(id: string): TourScene | undefined {
    return this.scenes.get(id);
  }

  /** Informações de alta frequência para o painel de debug (lidas sob demanda, fora da store). */
  getDebugInfo() {
    const rt = this.rt;
    return {
      token: this.token,
      transitioning: this.transitioning,
      pendingTarget: this.pendingTarget,
      scene: rt?.scene.id ?? null,
      narrationUrl: rt?.narrationUrl ?? null,
      narrationStarted: rt?.narrationStarted ?? false,
      narrationFinished: rt?.narrationFinished ?? false,
      exitRequested: rt?.exitRequested ?? false,
      narrationTime: this.d.narration.currentTime,
      narrationDuration: this.d.narration.duration,
      video: rt?.video ? { ...rt.video, time: this.d.video.currentTime, duration: this.d.video.duration } : null,
    };
  }

  // ───────────────────────────── Navegação ─────────────────────────────

  private async goTo(targetId: string, reason: NavReason): Promise<void> {
    const scene = this.scenes.get(targetId);
    if (!scene) {
      this.d.log.error("navigate:unknown-scene", { targetId, reason });
      return;
    }
    if (this.transitioning) {
      if (reason === "manual") {
        this.pendingTarget = targetId;
        this.d.log.info("navigate:queued", { targetId });
      } else {
        this.d.log.debug("navigate:ignored-during-transition", { targetId, reason });
      }
      return;
    }

    this.transitioning = true;
    this.invalidateCurrentScene();
    const token = this.token;
    this.d.log.info("scene:leave→enter", { to: targetId, reason, token });

    this.d.narration.stop();
    this.d.store.set({ phase: "transitioning", token, error: null, activeOverlays: [] });

    let shown = false;
    try {
      if (this.hasShownScene) await this.d.viewer.fadeTo(0, this.d.config.fadeOutMs);
      this.assertCurrent(token);

      const firstClipUrl = isVideo(scene) ? this.d.resolveUrl(scene.media.clips[0].src) : undefined;
      this.d.video.stop(firstClipUrl);

      const rt: SceneRuntime = {
        token,
        scene,
        abort: new AbortController(),
        narrationUrl: null,
        narrationStarted: false,
        narrationFinished: !scene.narration,
        exitRequested: false,
        exiting: false,
        playOnResume: false,
        video: isVideo(scene) ? createVideoRuntime(scene.media) : null,
      };
      this.rt = rt;
      this.d.store.set({
        phase: "loading",
        sceneId: scene.id,
        sceneIndex: this.order.indexOf(scene.id),
        nextSceneId: scene.next,
        panorama: "loading",
        narration: scene.narration ? "loading" : "none",
        narrationFinished: rt.narrationFinished,
        exitRequested: false,
        video: this.videoState(rt),
        preload: { sceneId: null, status: "idle" },
      });

      let texture: TextureHandle;
      try {
        const media = scene.media;
        texture =
          media.type === "video"
            ? await this.d.video.loadClip(0, firstClipUrl!, this.clipOptions(rt, 0, false))
            : await this.d.preloader.loadPanorama(media.src);
      } catch (e) {
        this.assertCurrent(token);
        this.d.store.set({ panorama: "error" });
        this.fail(isVideo(scene) ? "video" : "panorama", e);
        return;
      }
      this.assertCurrent(token);

      if (scene.narration) {
        try {
          rt.narrationUrl = await this.d.preloader.loadNarration(scene.narration);
        } catch (e) {
          this.d.log.warn("narration:preload-failed", { id: scene.narration, error: String(e) });
          rt.narrationUrl = this.d.resolveUrl(scene.narration);
        }
        this.assertCurrent(token);
      }

      this.d.viewer.showTexture(texture, isVideo(scene) ? "video" : "image");
      this.d.viewer.applyInitialView(scene.initialView);
      this.d.store.set({ panorama: "ready" });
      this.d.preloader.retain(this.retainIdsFor(scene));

      await this.d.viewer.fadeTo(1, this.d.config.fadeInMs);
      this.assertCurrent(token);
      this.hasShownScene = true;
      shown = true;
    } catch (e) {
      if (e instanceof StaleSceneError) {
        this.d.log.debug("scene:superseded", { token });
        return;
      }
      throw e;
    } finally {
      if (token === this.token) this.transitioning = false;
      if (!this.transitioning && this.pendingTarget) {
        const p = this.pendingTarget;
        this.pendingTarget = null;
        void this.goTo(p, "manual");
      }
    }

    if (shown && this.rt && this.rt.token === token && !this.pendingTargetApplied(token)) {
      this.d.store.set({ phase: "playing" });
      await this.startSceneMedia(this.rt);
    }
  }

  /** true se um destino pendente já iniciou outra navegação (token mudou). */
  private pendingTargetApplied(token: number): boolean {
    return token !== this.token;
  }

  private invalidateCurrentScene() {
    this.token++;
    this.rt?.abort.abort();
    this.stopCues?.();
    this.stopCues = null;
  }

  private assertCurrent(token: number) {
    if (token !== this.token) throw new StaleSceneError();
  }

  private isCurrent(rt: SceneRuntime, event: string): boolean {
    if (this.rt === rt && rt.token === this.token && !rt.abort.signal.aborted) return true;
    this.d.log.info("event:stale-ignored", { event, eventToken: rt.token, currentToken: this.token, scene: rt.scene.id });
    return false;
  }

  // ───────────────────────────── Mídia da cena ─────────────────────────────

  private async startSceneMedia(rt: SceneRuntime) {
    const scene = rt.scene;
    if (isVideo(scene)) {
      try {
        await this.d.video.play();
      } catch (e) {
        if (!this.isCurrent(rt, "video:play-failed")) return;
        this.fail(isAutoplayBlock(e) ? "autoplay" : "video", e);
        return;
      }
      this.preloadAfterClipStart(rt, 0);
    } else {
      this.prefetchNextScene(rt);
    }
    this.startCues(rt);

    if (!scene.narration) {
      this.onNarrationFinished(rt, "none");
      return;
    }
    const url = rt.narrationUrl!;
    const at = scene.sync?.narrationStartAt;
    if (at && isVideo(scene)) {
      this.d.store.set({ narration: "waiting" });
      this.d.video.onTimeReached(at.clip, at.time, () => void this.startNarration(rt, url), rt.abort.signal);
    } else {
      await this.startNarration(rt, url);
    }
  }

  private async startNarration(rt: SceneRuntime, url: string) {
    if (!this.isCurrent(rt, "narration:start")) return;
    rt.narrationStarted = true;
    this.d.store.set({ narration: "playing" });
    this.d.log.info("narration:start", { scene: rt.scene.id, token: rt.token });
    try {
      await this.d.narration.start(
        url,
        {
          onEnded: () => {
            if (!this.isCurrent(rt, "narration:ended")) return;
            this.d.log.info("narration:ended", { scene: rt.scene.id, token: rt.token });
            this.onNarrationFinished(rt, "ended");
          },
          onError: (err) => {
            if (!this.isCurrent(rt, "narration:error")) return;
            this.d.store.set({ narration: "error" });
            this.fail("narration", err);
          },
          onStall: (stalled) => {
            if (!this.isCurrent(rt, "narration:stall")) return;
            const cur = this.d.store.get().error;
            if (stalled && !cur) this.setError("narration-stalled", new Error("A narração parou de avançar."));
            if (!stalled && cur?.kind === "narration-stalled") this.d.store.set({ error: null });
          },
        },
        rt.abort.signal,
      );
      if (this.isCurrent(rt, "narration:started") && this.d.store.get().phase === "paused") this.d.narration.pause();
    } catch (e) {
      if (!this.isCurrent(rt, "narration:start-failed")) return;
      if (isAutoplayBlock(e)) {
        this.d.store.set({ narration: "paused" });
        this.fail("autoplay", e);
      } else {
        this.d.store.set({ narration: "error" });
        this.fail("narration", e);
      }
    }
  }

  private onNarrationFinished(rt: SceneRuntime, why: "ended" | "skipped" | "none") {
    rt.narrationFinished = true;
    rt.exitRequested = true;
    this.d.store.set({ narration: why === "none" ? "none" : "ended", narrationFinished: true, exitRequested: true });
    this.apply(rt, decideOnNarrationEnded(rt.scene, this.view(rt)), `narration:${why}`);
  }

  private clipOptions(rt: SceneRuntime, index: number, crossfade: boolean) {
    const media = rt.scene.media as VideoSceneMedia;
    return {
      ambientVolume: media.clips[index].ambientVolume ?? media.ambientVolume,
      signal: rt.abort.signal,
      crossfade,
      handlers: {
        onClipEnded: (i: number) => {
          if (!this.isCurrent(rt, "video:clip-ended")) return;
          if (!rt.video || i !== rt.video.clipIndex) {
            this.d.log.info("video:clip-ended-ignored", { i, current: rt.video?.clipIndex });
            return;
          }
          rt.video.clipsCompleted[i] = true;
          this.d.log.info("video:clip-ended", { scene: rt.scene.id, clip: i, cycle: rt.video.videoCycle });
          this.d.store.set({ video: this.videoState(rt) });
          this.apply(rt, decideOnClipEnded(rt.scene, this.view(rt), this.d.config), "video:clip-ended");
        },
        onError: (i: number, err: Error) => {
          if (!this.isCurrent(rt, "video:error")) return;
          this.d.log.error("video:error", { scene: rt.scene.id, clip: i, error: err.message });
          this.fail("video", err);
        },
      },
    };
  }

  private apply(rt: SceneRuntime, decision: SceneDecision, cause: string) {
    if (!this.isCurrent(rt, `decision:${decision.type}`)) return;
    this.d.log.info("scene:decision", { scene: rt.scene.id, cause, decision: decision.type, ...("index" in decision ? { clip: decision.index, cycle: decision.cycle } : {}) });
    switch (decision.type) {
      case "advance":
        this.autoAdvance(rt);
        break;
      case "hold":
        if (rt.video) rt.video.holding = true;
        this.d.store.set({ video: this.videoState(rt) });
        break;
      case "playClip":
        void this.playClip(rt, decision.index, decision.cycle);
        break;
      case "wait":
        break;
    }
  }

  private async playClip(rt: SceneRuntime, index: number, cycle: number) {
    const media = rt.scene.media as VideoSceneMedia;
    const video = rt.video!;
    video.clipIndex = index;
    video.videoCycle = cycle;
    video.holding = false;
    this.d.store.set({ video: this.videoState(rt) });
    try {
      const url = this.d.resolveUrl(media.clips[index].src);
      const texture = await this.d.video.loadClip(index, url, this.clipOptions(rt, index, true));
      if (!this.isCurrent(rt, "video:clip-loaded")) return;
      this.d.viewer.showTexture(texture, "video");
      if (this.d.store.get().phase === "paused") {
        rt.playOnResume = true;
      } else {
        await this.d.video.play();
      }
      if (!this.isCurrent(rt, "video:clip-started")) return;
      this.d.log.info("video:clip-start", { scene: rt.scene.id, clip: index, cycle });
      this.preloadAfterClipStart(rt, index);
    } catch (e) {
      if (!this.isCurrent(rt, "video:clip-failed")) return;
      this.fail(isAutoplayBlock(e) ? "autoplay" : "video", e);
    }
  }

  private async resumeMedia(rt: SceneRuntime, fromAutoplayBlock = false) {
    try {
      if (rt.video && (!rt.video.holding || fromAutoplayBlock)) {
        rt.playOnResume = false;
        await this.d.video.play();
      }
      if (rt.narrationStarted && !rt.narrationFinished) await this.d.narration.resume();
    } catch (e) {
      if (!this.isCurrent(rt, "resume-failed")) return;
      this.fail(isAutoplayBlock(e) ? "autoplay" : "narration", e);
    }
  }

  private autoAdvance(rt: SceneRuntime) {
    if (!this.isCurrent(rt, "auto-advance") || rt.exiting) return;
    rt.exiting = true;
    const next = rt.scene.next;
    if (next && this.scenes.has(next)) {
      void this.goTo(next, "auto");
      return;
    }
    if (next) this.d.log.error("navigate:invalid-next", { scene: rt.scene.id, next });
    this.finishTour(rt);
  }

  private finishTour(rt: SceneRuntime) {
    this.d.log.info("tour:end", { scene: rt.scene.id });
    rt.exiting = true;
    this.stopCues?.();
    this.stopCues = null;
    this.d.narration.stop();
    this.d.video.pause();
    const credits = this.d.tour.credits;
    const token = this.token;
    if (rt.scene.onEnd === "credits" && credits.overlays.length > 0) {
      this.d.store.set({ phase: "credits", activeOverlays: credits.overlays.map((o) => o.id) });
      this.schedule(() => {
        if (token === this.token) this.d.store.set({ phase: "finished", activeOverlays: [] });
      }, credits.displaySeconds * 1000);
    } else {
      this.d.store.set({ phase: "finished", activeOverlays: [] });
    }
  }

  // ───────────────────────────── Preload ─────────────────────────────

  /** Dentro da cena: pré-carrega o próximo clip; no último clip, a próxima cena. */
  private preloadAfterClipStart(rt: SceneRuntime, index: number) {
    const media = rt.scene.media as VideoSceneMedia;
    if (index + 1 < media.clips.length) {
      const url = this.d.resolveUrl(media.clips[index + 1].src);
      this.d.log.debug("preload:next-clip", { clip: index + 1 });
      this.d.video.prepare(url);
    } else if (rt.video && rt.video.videoCycle === 0) {
      this.prefetchNextScene(rt);
    }
  }

  private prefetchNextScene(rt: SceneRuntime) {
    const next = rt.scene.next ? this.scenes.get(rt.scene.next) : undefined;
    if (!next) return;
    this.d.store.set({ preload: { sceneId: next.id, status: "loading" } });
    const jobs: Promise<unknown>[] = [];
    const media = next.media;
    if (media.type === "video") this.d.video.prepare(this.d.resolveUrl(media.clips[0].src));
    else jobs.push(this.d.preloader.loadPanorama(media.src));
    if (next.narration) jobs.push(this.d.preloader.loadNarration(next.narration));
    Promise.all(jobs).then(
      () => {
        if (this.rt === rt) this.d.store.set({ preload: { sceneId: next.id, status: "ready" } });
      },
      (e) => {
        this.d.log.warn("preload:failed", { scene: next.id, error: String(e) });
        if (this.rt === rt) this.d.store.set({ preload: { sceneId: next.id, status: "error" } });
      },
    );
  }

  private retainIdsFor(scene: TourScene): string[] {
    const ids: string[] = [];
    const add = (s?: TourScene) => {
      if (!s) return;
      if (s.media.type === "image") ids.push(s.media.src);
      if (s.narration) ids.push(s.narration);
    };
    add(scene);
    add(scene.next ? this.scenes.get(scene.next) : undefined);
    return ids;
  }

  // ───────────────────────────── Cues ─────────────────────────────

  private startCues(rt: SceneRuntime) {
    this.stopCues?.();
    this.stopCues = null;
    if (rt.scene.cues.length === 0) return;
    this.stopCues = this.interval(() => {
      if (this.rt !== rt) return;
      const active = activeCueOverlays(rt.scene.cues, {
        narration: rt.narrationStarted ? this.d.narration.currentTime : null,
        clip: rt.video ? this.d.video.currentTime : null,
        clipIndex: rt.video?.clipIndex ?? null,
      });
      const prev = this.d.store.get().activeOverlays;
      if (active.length !== prev.length || active.some((a, i) => a !== prev[i])) this.d.store.set({ activeOverlays: active });
    }, 250);
  }

  // ───────────────────────────── Estado / erros ─────────────────────────────

  private view(rt: SceneRuntime): SceneRuntimeView {
    return {
      narrationFinished: rt.narrationFinished,
      video: rt.video,
      narrationRemaining: rt.narrationStarted && !rt.narrationFinished ? this.d.narration.remaining() : null,
    };
  }

  private videoState(rt: SceneRuntime) {
    if (!rt.video) return null;
    return {
      clipIndex: rt.video.clipIndex,
      clipCount: (rt.scene.media as VideoSceneMedia).clips.length,
      clipsCompleted: [...rt.video.clipsCompleted],
      videoCycle: rt.video.videoCycle,
      holding: rt.video.holding,
    };
  }

  private fail(kind: ErrorKind, e: unknown) {
    this.setError(kind, e);
    this.d.store.set({ phase: "error" });
  }

  private setError(kind: ErrorKind, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    this.d.log.error("tour:error", { kind, message, scene: this.rt?.scene.id });
    this.d.store.set({ error: { kind, message, sceneId: this.rt?.scene.id ?? null } });
  }
}

function isAutoplayBlock(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "NotAllowedError";
}
