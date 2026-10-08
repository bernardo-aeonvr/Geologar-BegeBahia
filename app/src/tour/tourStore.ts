/**
 * Estado central do tour para a UI (baixa frequência — muda em eventos, não a cada frame).
 * Flags como "isTransitioning" são DERIVADAS de `phase` (ver selectors), não estados paralelos.
 */
import { createStore } from "../lib/store";

export type TourPhase =
  | "idle" // antes de iniciar
  | "loading" // carregando a mídia da cena
  | "playing"
  | "paused"
  | "transitioning" // fade-out/troca/fade-in
  | "error" // erro que exige ação do usuário
  | "credits" // créditos da última cena
  | "finished"; // tela de conclusão

export type ErrorKind = "manifest" | "panorama" | "video" | "narration" | "narration-stalled" | "autoplay";

export interface TourError {
  kind: ErrorKind;
  message: string;
  sceneId: string | null;
}

export interface VideoState {
  clipIndex: number;
  clipCount: number;
  clipsCompleted: boolean[];
  videoCycle: number;
  holding: boolean;
}

export interface TourState {
  phase: TourPhase;
  token: number;
  sceneId: string | null;
  sceneIndex: number;
  sceneCount: number;
  nextSceneId: string | null;
  panorama: "idle" | "loading" | "ready" | "error";
  narration: "idle" | "loading" | "waiting" | "playing" | "paused" | "ended" | "error" | "none";
  video: VideoState | null;
  narrationFinished: boolean;
  exitRequested: boolean;
  volume: number;
  muted: boolean;
  error: TourError | null;
  preload: { sceneId: string | null; status: "idle" | "loading" | "ready" | "error" };
  activeOverlays: string[];
  /** Slide visível de cada overlay em sequência (derivado do tempo da narração). */
  overlaySlides: Record<string, number>;
}

export const initialTourState: TourState = {
  phase: "idle",
  token: 0,
  sceneId: null,
  sceneIndex: -1,
  sceneCount: 0,
  nextSceneId: null,
  panorama: "idle",
  narration: "idle",
  video: null,
  narrationFinished: false,
  exitRequested: false,
  volume: 1,
  muted: false,
  error: null,
  preload: { sceneId: null, status: "idle" },
  activeOverlays: [],
  overlaySlides: {},
};

export function createTourStore() {
  return createStore<TourState>({ ...initialTourState });
}

export type TourStore = ReturnType<typeof createTourStore>;

export const selectors = {
  isTransitioning: (s: TourState) => s.phase === "transitioning" || s.phase === "loading",
  isNarrationPlaying: (s: TourState) => s.narration === "playing",
  isNarrationFinished: (s: TourState) => s.narrationFinished,
  isPanoramaLoaded: (s: TourState) => s.panorama === "ready",
  canPause: (s: TourState) => s.phase === "playing" || s.phase === "paused",
};
