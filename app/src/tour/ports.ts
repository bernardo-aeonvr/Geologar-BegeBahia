/**
 * Contratos entre o TourEngine e as camadas de mídia/visualização.
 * O motor só conhece estas interfaces — os testes usam implementações falsas.
 * Todo registro de callback recebe um AbortSignal da cena: abortar = remover todos os listeners.
 */
import type { InitialView } from "../types/tour";

/** Handle opaco de textura (THREE.Texture no browser; qualquer coisa nos testes). */
export type TextureHandle = unknown;

export interface NarrationHandlers {
  onEnded(): void;
  onError(error: Error): void;
  /** true = sem progresso há tempo demais sem estar pausada; false = voltou a progredir. */
  onStall(stalled: boolean): void;
}

export interface NarrationPort {
  /** Troca o áudio do único elemento de narração e começa a tocar. Rejeita se o navegador bloquear. */
  start(url: string, handlers: NarrationHandlers, signal: AbortSignal): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  /** Para e solta o áudio atual. */
  stop(): void;
  readonly currentTime: number;
  readonly duration: number;
  /** Segundos restantes pela duração REAL do arquivo; null se desconhecida. */
  remaining(): number | null;
}

export interface VideoHandlers {
  /** O clip terminou inteiro (evento real `ended`). */
  onClipEnded(index: number): void;
  onError(index: number, error: Error): void;
}

export interface VideoPort {
  /** Pré-carrega uma URL num elemento livre do pool (não interrompe o clip ativo). */
  prepare(url: string): void;
  /**
   * Deixa o clip pronto para exibição (primeiro quadro decodificado, em t=0) e o torna ativo.
   * Não começa a tocar. Retorna a textura para o viewer.
   */
  loadClip(
    index: number,
    url: string,
    opts: { ambientVolume: number; handlers: VideoHandlers; signal: AbortSignal; crossfade: boolean },
  ): Promise<TextureHandle>;
  /** Começa/continua o clip ativo. */
  play(): Promise<void>;
  pause(): void;
  /** Para tudo. Mantém pré-carregada apenas `keepUrl` (se houver); descarrega o resto. */
  stop(keepUrl?: string): void;
  /** Chama `cb` uma vez quando o clip ativo `clip` atingir `time` s (tempo do vídeo). */
  onTimeReached(clip: number, time: number, cb: () => void, signal: AbortSignal): void;
  readonly currentTime: number;
  readonly duration: number;
}

export interface ViewerPort {
  showTexture(texture: TextureHandle, kind: "image" | "video"): void;
  clear(): void;
  applyInitialView(view: InitialView): void;
  /** Anima o fade (0 = preto, 1 = visível). */
  fadeTo(level: 0 | 1, ms: number): Promise<void>;
}

export interface PreloaderPort {
  loadPanorama(id: string): Promise<TextureHandle>;
  /** URL pronta para o elemento de narração (blob pré-carregado ou URL direta). */
  loadNarration(id: string): Promise<string>;
  /** Mantém só estes ids em memória; libera o resto (texturas, blobs). */
  retain(ids: string[]): void;
  clear(): void;
}

export interface AudioPort {
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  /** Retoma o AudioContext se o sistema o suspendeu. */
  resume(): Promise<void>;
}
