/**
 * AssetPreloader — panoramas (textura já enviada à GPU) e narrações (Blob) da cena atual + próxima.
 *
 *  - Imagem: fetch → createImageBitmap (decodifica fora da thread principal) → Texture →
 *    renderer.initTexture() (upload antecipado). A troca de cena não trava esperando decode/upload.
 *  - Narração: fetch → Blob → objectURL (troca instantânea no único <audio>).
 *  - `retain(ids)`: tudo que não estiver na lista é liberado (dispose da textura, close do bitmap,
 *    revokeObjectURL). O motor mantém só atual + próxima → memória de GPU limitada (Quest/celular).
 *  - Falhas não ficam em cache: a próxima tentativa refaz o download.
 */
import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Texture } from "three";
import { createLogger } from "../lib/log";
import type { PreloaderPort, TextureHandle } from "../tour/ports";
import type { MediaResolver } from "./MediaResolver";

const log = createLogger("preload");

interface TextureUploader {
  initTexture(texture: Texture): void;
  readonly maxAnisotropy: number;
}

type Entry =
  | { kind: "image"; promise: Promise<Texture>; texture?: Texture; bitmap?: ImageBitmap; status: "loading" | "ready" | "error" }
  | { kind: "audio"; promise: Promise<string>; url?: string; blob: boolean; status: "loading" | "ready" | "error" };

export class AssetPreloader implements PreloaderPort {
  private entries = new Map<string, Entry>();

  constructor(
    private resolver: MediaResolver,
    private uploader: TextureUploader,
  ) {}

  loadPanorama(id: string): Promise<TextureHandle> {
    const hit = this.entries.get(id);
    if (hit?.kind === "image") return hit.promise;
    const entry: Entry = { kind: "image", status: "loading", promise: null as unknown as Promise<Texture> };
    entry.promise = this.fetchTexture(id).then(
      ({ texture, bitmap }) => {
        entry.texture = texture;
        entry.bitmap = bitmap;
        entry.status = "ready";
        // Se já foi liberado enquanto carregava, descarta.
        if (this.entries.get(id) !== entry) this.disposeEntry(entry);
        return texture;
      },
      (e) => {
        entry.status = "error";
        if (this.entries.get(id) === entry) this.entries.delete(id);
        throw e;
      },
    );
    this.entries.set(id, entry);
    return entry.promise;
  }

  loadNarration(id: string): Promise<string> {
    const hit = this.entries.get(id);
    if (hit?.kind === "audio") return hit.promise;
    const url = this.resolver.url(id);
    const entry: Entry = { kind: "audio", status: "loading", blob: false, promise: null as unknown as Promise<string> };
    entry.promise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
        return r.blob();
      })
      .then(
        (blob) => {
          entry.url = URL.createObjectURL(blob);
          entry.blob = true;
          entry.status = "ready";
          if (this.entries.get(id) !== entry) this.disposeEntry(entry);
          return entry.url;
        },
        (e) => {
          // Sem pré-carregamento possível (ex.: servidor sem CORS): usa a URL direta. O <audio>
          // reportará erro de verdade se o arquivo não existir.
          log.warn("narration:fallback-direct-url", { id, error: String(e) });
          entry.url = url;
          entry.status = "ready";
          return url;
        },
      );
    this.entries.set(id, entry);
    return entry.promise;
  }

  retain(ids: string[]): void {
    const keep = new Set(ids);
    for (const [id, entry] of this.entries) {
      if (keep.has(id)) continue;
      this.entries.delete(id);
      this.disposeEntry(entry);
      log.debug("release", { id });
    }
  }

  clear(): void {
    this.retain([]);
  }

  status(): { id: string; kind: string; status: string }[] {
    return [...this.entries].map(([id, e]) => ({ id, kind: e.kind, status: e.status }));
  }

  private disposeEntry(entry: Entry) {
    if (entry.kind === "image") {
      entry.texture?.dispose();
      entry.bitmap?.close();
    } else if (entry.blob && entry.url) {
      URL.revokeObjectURL(entry.url);
    }
  }

  private async fetchTexture(id: string): Promise<{ texture: Texture; bitmap?: ImageBitmap }> {
    const { url } = this.resolver.resolve(id);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Panorama indisponível (HTTP ${res.status}): ${id}`);
    const blob = await res.blob();

    let texture: Texture;
    let bitmap: ImageBitmap | undefined;
    try {
      // ImageBitmap ignora texture.flipY → vira na decodificação.
      bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      texture = new Texture(bitmap);
      texture.flipY = false;
    } catch {
      // Fallback (navegadores sem as opções de createImageBitmap).
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
      await img.decode();
      URL.revokeObjectURL(objectUrl);
      texture = new Texture(img);
    }
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, this.uploader.maxAnisotropy);
    texture.needsUpdate = true;
    this.uploader.initTexture(texture); // upload antecipado para a GPU
    return { texture, bitmap };
  }
}
