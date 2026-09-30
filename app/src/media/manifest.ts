/** Formato de `public/media/manifest.json`, gerado por `scripts/build-media.mjs`. */
export type MediaProfile = "mobile" | "web" | "high";
export type MediaKind = "image" | "video" | "audio";

export interface MediaVariant {
  file: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  hasAudio?: boolean;
}

export interface MediaAsset {
  kind: MediaKind;
  source: string;
  variants: Partial<Record<MediaProfile, MediaVariant>>;
}

export interface MediaManifest {
  version: number;
  generatedAt?: string;
  assets: Record<string, MediaAsset>;
}

export async function loadManifest(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<MediaManifest> {
  const url = new URL("manifest.json", new URL(baseUrl, document.baseURI)).toString();
  const res = await fetchImpl(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest.json indisponível (${res.status}) em ${url}`);
  const json = (await res.json()) as MediaManifest;
  if (!json.assets) throw new Error("manifest.json inválido");
  return json;
}
