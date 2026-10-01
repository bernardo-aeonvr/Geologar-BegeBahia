/**
 * Regra pura da música de fundo, derivada do estado do tour (sem DOM, sem timers).
 *  - antes de iniciar ou com o tour pausado → música parada;
 *  - narrador falando → música abaixada (ducking);
 *  - demais momentos (transições, vídeo após a narração, conclusão) → volume normal.
 */
import type { TourState } from "../tour/tourStore";

export interface MusicTarget {
  playing: boolean;
  ducked: boolean;
}

export function musicTarget(s: Pick<TourState, "phase" | "narration">): MusicTarget {
  if (s.phase === "idle" || s.phase === "paused") return { playing: false, ducked: false };
  return { playing: true, ducked: s.narration === "playing" };
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
