/**
 * Regras de término de cena — PURAS e centralizadas (sem DOM, sem timers, sem ids de cena).
 *
 * O TourEngine chama estas funções quando algo termina (narração, clip) e aplica a decisão.
 * Todo comportamento vem da configuração da cena (`TourScene.media`), nunca de `if (id === ...)`.
 *
 * Imagem:  narração acabou → avança.
 * Vídeo:   narração acabou ∧ clips obrigatórios exibidos inteiros ∧ ponto natural de saída → avança.
 */
import type { Cue, TourScene, VideoSceneMedia } from "../types/tour";

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

/** Overlays ativos pelos cues da cena, dado o tempo atual das linhas do tempo. */
export function activeCueOverlays(
  cues: Cue[],
  times: { narration: number | null; clip: number | null; clipIndex: number | null },
): string[] {
  const active: string[] = [];
  for (const cue of cues) {
    if (cue.action.type !== "showOverlay") continue;
    const t =
      cue.timeline === "narration" ? times.narration : times.clipIndex === cue.timeline.clip ? times.clip : null;
    if (t === null) continue;
    if (t >= cue.from && (cue.to === undefined || t < cue.to)) active.push(cue.action.overlayId);
  }
  return active;
}
