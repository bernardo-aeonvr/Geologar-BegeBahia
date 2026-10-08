/**
 * Regras de término de cena — PURAS e centralizadas (sem DOM, sem timers, sem ids de cena).
 *
 * O TourEngine chama estas funções quando algo termina (narração, clip) e aplica a decisão.
 * Todo comportamento vem da configuração da cena (`TourScene.media`), nunca de `if (id === ...)`.
 *
 * Imagem:  narração acabou → avança.
 * Vídeo:   narração acabou ∧ clips obrigatórios exibidos inteiros ∧ ponto natural de saída → avança.
 */
import type { Cue, Overlay, OverlaySlide, TourScene, VideoSceneMedia } from "../types/tour";

export interface VideoRuntime {
  /** Clip em reprodução (ou o último exibido). */
  clipIndex: number;
  /** clipsCompleted[i] = o clip i já terminou inteiro pelo menos uma vez. */
  clipsCompleted: boolean[];
  /** Quantas vezes a sequência recomeçou (loop). */
  videoCycle: number;
  /** Sequência acabou sem loop; último quadro congelado esperando a narração. */
  holding: boolean;
}

export interface SceneRuntimeView {
  narrationFinished: boolean;
  video: VideoRuntime | null;
  /** Segundos restantes de narração (duração real do arquivo − tempo atual); null se desconhecido/sem narração. */
  narrationRemaining: number | null;
}

export type SceneDecision =
  | { type: "advance" }
  | { type: "wait" }
  | { type: "playClip"; index: number; cycle: number }
  | { type: "hold" };

export interface RulesConfig {
  /** Padrão para `VideoSceneMedia.loopMinNarrationRemaining`. */
  loopMinNarrationRemaining: number;
}

export function isVideo(scene: TourScene): scene is TourScene & { media: VideoSceneMedia } {
  return scene.media.type === "video";
}

export function createVideoRuntime(media: VideoSceneMedia): VideoRuntime {
  return { clipIndex: 0, clipsCompleted: media.clips.map(() => false), videoCycle: 0, holding: false };
}

/** Todos os clips obrigatórios já foram exibidos inteiros (se a cena exigir). */
export function requiredClipsDone(media: VideoSceneMedia, video: VideoRuntime): boolean {
  if (!media.requireAllClipsOnce) return true;
  return media.clips.every((c, i) => !c.required || video.clipsCompleted[i]);
}

/**
 * Condição única de avanço automático.
 * @param atNaturalExit o vídeo está num ponto natural de saída (um clip acabou de terminar ou está congelado).
 */
export function canAutoAdvance(scene: TourScene, rt: SceneRuntimeView, atNaturalExit: boolean): boolean {
  if (!scene.autoAdvance) return false;
  if (!rt.narrationFinished) return false;
  if (!isVideo(scene)) return true;
  const video = rt.video;
  if (!video) return true;
  if (!requiredClipsDone(scene.media, video)) return false;
  return atNaturalExit || video.holding || !scene.media.finishCurrentClipAfterNarration;
}

/** A narração terminou (evento real `ended`, ou o usuário escolheu seguir sem ela). */
export function decideOnNarrationEnded(scene: TourScene, rt: SceneRuntimeView): SceneDecision {
  return canAutoAdvance(scene, { ...rt, narrationFinished: true }, false) ? { type: "advance" } : { type: "wait" };
}

/**
 * Um clip terminou inteiro. `rt.video.clipsCompleted[clipIndex]` já deve estar marcado.
 */
export function decideOnClipEnded(scene: TourScene, rt: SceneRuntimeView, cfg: RulesConfig): SceneDecision {
  if (!isVideo(scene) || !rt.video) return { type: "wait" };
  const media = scene.media;
  const video = rt.video;
  const i = video.clipIndex;
  const isLast = i >= media.clips.length - 1;

  if (!isLast) {
    // Narração já acabou e nada obrigatório falta → este é um ponto natural de saída.
    if (canAutoAdvance(scene, rt, true)) return { type: "advance" };
    return { type: "playClip", index: i + 1, cycle: video.videoCycle };
  }

  // Último clip da sequência.
  if (rt.narrationFinished) {
    return canAutoAdvance(scene, rt, true) ? { type: "advance" } : { type: "hold" };
  }

  // Narração ainda tocando.
  if (!media.loopWhileNarrating) return { type: "hold" };
  const threshold = media.loopMinNarrationRemaining ?? cfg.loopMinNarrationRemaining;
  if (threshold > 0 && rt.narrationRemaining !== null && rt.narrationRemaining < threshold) {
    // Evita um ciclo inteiro extra por uma fração de segundo de narração (AUDITORIA A3).
    return { type: "hold" };
  }
  return { type: "playClip", index: 0, cycle: video.videoCycle + 1 };
}

/** Tempos atuais das linhas do tempo da cena (null = linha ainda não começou). */
export interface CueTimes {
  narration: number | null;
  clip: number | null;
  clipIndex: number | null;
}

export interface OverlayEvaluation {
  /** Overlays visíveis agora, na ordem dos cues. */
  active: string[];
  /** Para overlays com `slides`: índice do slide visível. */
  slides: Record<string, number>;
}

function cueTime(timeline: Cue["timeline"], times: CueTimes): number | null {
  return timeline === "narration" ? times.narration : times.clipIndex === timeline.clip ? times.clip : null;
}

/**
 * Slide visível de uma sequência no instante `t` (mesma linha do tempo dos slides):
 * o último slide cujo `from` ≤ t e (sem `to` ou t < `to`). −1 = nenhum (entre/antes dos slides).
 * Determinístico: depende só de `t` — pausa, seek para frente/trás e reinício funcionam sozinhos.
 */
export function slideIndexAt(slides: OverlaySlide[], t: number): number {
  for (let i = slides.length - 1; i >= 0; i--) {
    const s = slides[i];
    if (t >= s.from) return s.to === undefined || t < s.to ? i : -1;
  }
  return -1;
}

/** Avalia cues + sequências da cena para os tempos atuais. */
export function evaluateOverlays(cues: Cue[], overlays: Overlay[], times: CueTimes): OverlayEvaluation {
  const active: string[] = [];
  const slides: Record<string, number> = {};
  for (const cue of cues) {
    if (cue.action.type !== "showOverlay") continue;
    const t = cueTime(cue.timeline, times);
    if (t === null || t < cue.from || (cue.to !== undefined && t >= cue.to)) continue;
    const id = cue.action.overlayId;
    const ov = overlays.find((o) => o.id === id);
    if (ov?.slides) {
      const i = slideIndexAt(ov.slides, t);
      if (i < 0) continue;
      slides[id] = i;
    }
    if (!active.includes(id)) active.push(id);
  }
  return { active, slides };
}

/** Overlays ativos pelos cues da cena (sem informação de slide). */
export function activeCueOverlays(cues: Cue[], times: CueTimes): string[] {
  return evaluateOverlays(cues, [], times).active;
}
