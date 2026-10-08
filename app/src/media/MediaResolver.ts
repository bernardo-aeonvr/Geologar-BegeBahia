/**
 * MediaResolver: id lógico ("video/e3-p1-1") + perfil → URL concreta.
 *
 * O motor do tour nunca sabe qual arquivo foi escolhido. Trocar a origem (Pages → servidor
 * próprio → pacote offline) é só mudar `mediaBaseUrl`; trocar qualidade é só mudar o perfil.
 */
import type { MediaAsset, MediaManifest, MediaProfile, MediaVariant } from "./manifest";

/** Ordem de fallback quando o perfil pedido não existe para um asset. */
const FALLBACK: Record<MediaProfile, MediaProfile[]> = {
  high: ["high", "web", "mobile"],
  web: ["web", "mobile", "high"],
  mobile: ["mobile", "web", "high"],
};

export interface ResolvedMedia {
  id: string;
  url: string;
  profile: MediaProfile;
  variant: MediaVariant;
}

export class MediaResolver {
  constructor(
    private manifest: MediaManifest,
    private baseUrl: string,
    public profiles: { image: MediaProfile; video: MediaProfile; audio: MediaProfile; overlay?: MediaProfile },
  ) {}

  has(id: string): boolean {
    return id in this.manifest.assets;
  }

  asset(id: string): MediaAsset {
    const a = this.manifest.assets[id];
    if (!a) throw new Error(`Mídia "${id}" não está no manifest.json`);
    return a;
  }

  resolve(id: string): ResolvedMedia {
    const a = this.asset(id);
    const wanted = this.profiles[a.kind] ?? "web";
    for (const p of FALLBACK[wanted]) {
      const v = a.variants[p];
      if (v) return { id, url: this.urlFor(v), profile: p, variant: v };
    }
    throw new Error(`Mídia "${id}" não tem variantes no manifest.json`);
  }

  url(id: string): string {
    return this.resolve(id).url;
  }

  /**
   * URL com versão (`?v=`): o cache offline (service worker) guarda por URL completa, então uma
   * variante regenerada com o MESMO nome de arquivo (ex.: vídeo recodificado) nunca sai velha do cache.
   */
  private urlFor(v: MediaVariant): string {
    const base = new URL(this.baseUrl, typeof document !== "undefined" ? document.baseURI : "http://localhost/");
    const url = new URL(v.file, base);
    url.searchParams.set("v", `${v.settingsHash ?? "0"}-${v.bytes}`);
    return url.toString();
  }
}

/**
 * Escolhe perfis pelo aparelho (D9): celular → "mobile" (2880×1440, menos banda e decoder);
 * desktop e Quest → "web" (4096×2048). Imagem "high" (original) só em desktop com textura ≥ 8192.
 */
export function detectProfiles(opts: {
  forced?: MediaProfile;
  maxTextureSize: number;
}): { image: MediaProfile; video: MediaProfile; audio: MediaProfile } {
  if (opts.forced && ["mobile", "web", "high"].includes(opts.forced)) {
    return { image: opts.forced, video: opts.forced, audio: "web" };
  }
  const ua = navigator.userAgent;
  const isQuest = /OculusBrowser|Quest/i.test(ua);
  const isMobile = !isQuest && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)));
  const video: MediaProfile = isMobile ? "mobile" : "web";
  const image: MediaProfile = !isMobile && !isQuest && opts.maxTextureSize >= 8192 ? "high" : "web";
  return { image, video, audio: "web" };
}
