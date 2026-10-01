/**
 * Configuração global do app — tudo que NÃO é específico de uma cena.
 * (O que é específico de cena fica em `tour/scenes.ts`.)
 */
import type { MediaProfile } from "../media/manifest";

function normalizeBase(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

const env = import.meta.env ?? {};
const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

export const appConfig = {
  /**
   * Origem das mídias. Relativa ao app por padrão (GitHub Pages / pacote offline).
   * Servidor próprio/CDN: VITE_MEDIA_BASE_URL=https://media.exemplo.com/geologar/
   */
  mediaBaseUrl: normalizeBase(env.VITE_MEDIA_BASE_URL || "./media/"),

  /** Perfil forçado: ?profile=mobile|web|high, depois VITE_MEDIA_PROFILE; senão detecção automática. */
  forcedProfile: (params.get("profile") || env.VITE_MEDIA_PROFILE || undefined) as MediaProfile | undefined,

  /** Transições entre cenas (ms). Independentes da duração dos áudios. */
  fadeOutMs: 450,
  fadeInMs: 600,

  /** Micro-crossfade do áudio ambiente na troca de clip dentro da mesma cena (ms). */
  clipAudioCrossfadeMs: 150,

  /** Padrão de `VideoSceneMedia.loopMinNarrationRemaining` (s). Ver AUDITORIA A3. */
  loopMinNarrationRemaining: 1.0,

  /** Narração sem progresso por este tempo (sem estar pausada) → aviso de travamento. */
  narrationStallMs: 8000,

  /** Volume inicial (0–1). */
  initialVolume: 1,

  /** Limite de devicePixelRatio para economizar GPU em telas densas. */
  maxPixelRatio: 2,

  /** Controles de câmera. */
  fovMin: 35,
  fovMax: 100,

  /** Painel de debug: ?debug=1, Shift+D, ou sempre em desenvolvimento se VITE_DEBUG=1. */
  debug: params.has("debug") || env.VITE_DEBUG === "1",

  /** WebXR habilitado (só tem efeito quando uma sessão VR começa). ?noxr desliga. */
  enableXR: !params.has("noxr"),

  /** Força o modo de abertura: ?mode=vr | ?mode=flat (testes). Padrão: detecção automática. */
  forcedViewMode: params.get("mode"),
};

export type AppConfig = typeof appConfig;
