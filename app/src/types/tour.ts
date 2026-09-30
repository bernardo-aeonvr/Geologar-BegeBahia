/**
 * Modelo de dados do tour.
 *
 * Tudo que descreve O QUE acontece em cada cena (mídia, narração, ordem, sincronização,
 * pop-ups, hotspots) vive aqui como dado, em `tour/scenes.ts`. O player e o motor só
 * interpretam esses dados — nenhuma regra é escrita por id de cena.
 *
 * Caminhos de mídia são IDS LÓGICOS ("video/e3-p1-1", "panoramas/e0-intro", "audio/e3-p1"),
 * sem extensão, perfil ou URL. O `MediaResolver` traduz id + perfil → URL usando o manifest.
 */

/** Enquadramento ao entrar na cena. Graus. yaw 0 = centro da imagem equiretangular, positivo para a direita. */
export interface InitialView {
  yaw: number;
  /** positivo para cima. Ignorado em VR (a cabeça manda). */
  pitch: number;
  /** campo de visão vertical em paisagem. Em retrato o viewer amplia automaticamente. */
  fov: number;
}

export interface ImageSceneMedia {
  type: "image";
  src: string;
}

export interface VideoClip {
  id: string;
  src: string;
  /** Precisa ser exibido inteiro pelo menos uma vez antes do avanço automático (com `requireAllClipsOnce`). */
  required: boolean;
  /** Sobrescreve `ambientVolume` da cena para este clip. */
  ambientVolume?: number;
}

export interface VideoSceneMedia {
  type: "video";
  /** Tocados em ordem. */
  clips: VideoClip[];
  /** Todos os clips `required` devem terminar inteiros ao menos uma vez antes do avanço automático. */
  requireAllClipsOnce: boolean;
  /** Acabou a sequência e a narração ainda toca → recomeça a sequência (videoCycle++). */
  loopWhileNarrating: boolean;
  /** Narração acabou → não corta: espera o clip em reprodução terminar naturalmente. */
  finishCurrentClipAfterNarration: boolean;
  /**
   * Segundos. Se, quando a sequência acaba, restar menos que isso de narração, NÃO inicia outro ciclo:
   * segura o último quadro e a cena termina junto com a narração. Evita um ciclo inteiro extra por
   * frações de segundo (ex.: Etapa 4, vídeo 29,6 s × narração 29,78 s). Omitido → `appConfig.loopMinNarrationRemaining`.
   * 0 = regra pura (sempre faz loop).
   */
  loopMinNarrationRemaining?: number;
  /** Volume do áudio ambiente dos vídeos, 0–1, abaixo da narração. */
  ambientVolume: number;
}

export type SceneMedia = ImageSceneMedia | VideoSceneMedia;

/** Sincronização semântica entre narração e vídeo — sempre como dado da cena, nunca no player. */
export interface SceneSync {
  /** A narração começa quando o clip `clip` atingir `time` segundos (tempo do VÍDEO — seguro com pause). */
  narrationStartAt?: { clip: number; time: number };
}

/** Linha do tempo de referência para cues. */
export type CueTimeline = "narration" | { clip: number };

/** Evento temporizado pela mídia (não pelo relógio): ex. mostrar um pop-up entre 32 s e 40 s da narração. */
export interface Cue {
  id: string;
  timeline: CueTimeline;
  from: number;
  /** Omitido = até o fim da cena. */
  to?: number;
  action: TourAction;
}

/** Conteúdo exibível (pop-up, imagem comparativa, animação, créditos…). */
export interface Overlay {
  id: string;
  kind: "image" | "video" | "text" | "html";
  /** id lógico de mídia (image/video) — resolvido pelo MediaResolver. */
  src?: string;
  title?: string;
  body?: string;
  placement?: "center" | "top" | "bottom" | "left" | "right" | "corner";
  /** Não bloqueia a vista panorâmica (pop-up reduzido). */
  compact?: boolean;
}

export type TourAction =
  | { type: "showOverlay"; overlayId: string }
  | { type: "hideOverlay"; overlayId: string }
  | { type: "goToScene"; sceneId: string }
  | { type: "playAudio"; src: string }
  | { type: "openUrl"; url: string }
  | { type: "custom"; name: string; payload?: unknown };

export interface Hotspot {
  id: string;
  type: "info" | "image" | "audio" | "video" | "navigation" | "modal" | "custom";
  yaw: number;
  pitch: number;
  icon?: string;
  title?: string;
  content?: string;
  action: TourAction;
}

export interface TourScene {
  id: string;
  title: string;
  /** Etapa do roteiro, exibida na UI. */
  stage: string;
  media: SceneMedia;
  narration?: string;
  initialView: InitialView;
  /** Próxima cena no roteiro. null = última. */
  next: string | null;
  /** Avança sozinho quando a regra de término da cena for satisfeita. */
  autoAdvance: boolean;
  /** O que fazer quando a cena termina e não há `next`. */
  onEnd?: "advance" | "credits";
  sync?: SceneSync;
  cues: Cue[];
  hotspots: Hotspot[];
  overlays: Overlay[];
}

export interface CreditsConfig {
  /** Overlays (logos, textos) exibidos em pop-up reduzido ao final. Vazio = pula direto para a conclusão. */
  overlays: Overlay[];
  /** Segundos que os créditos ficam visíveis antes da tela de conclusão. */
  displaySeconds: number;
}

export interface TourDefinition {
  id: string;
  title: string;
  firstScene: string;
  scenes: TourScene[];
  credits: CreditsConfig;
}
