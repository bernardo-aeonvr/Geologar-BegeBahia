/**
 * Download da experiência inteira para o aparelho (Cache Storage), servido depois pelo service
 * worker (public/sw.js). Objetivo: o tour não depender da rede durante a reprodução (celular em 4G
 * instável, Quest, uso offline) SEM carregar tudo na memória.
 *
 *  - Só começa quando a pessoa pede (botão "Baixar para usar offline" no menu inicial); quem
 *    não pede não tem service worker nem cache — o app roda exatamente como sem este módulo.
 *  - Ordem do roteiro (cena 1, cena 2, …): o download fica à frente da reprodução.
 *  - Só grava em disco. Memória/GPU continuam como antes: cena atual + próxima (AssetPreloader).
 *  - Sem service worker (navegador antigo, `?nosw`, dev) → não baixa nada; o tour segue pela rede.
 *  - Sem espaço suficiente → não baixa; o tour segue pela rede.
 *  - O que já está no cache é pulado; entradas antigas (outra versão `?v=`) são apagadas.
 */
import { createStore, type Store } from "../lib/store";
import type { TourDefinition, TourScene } from "../types/tour";

/** Mesmo nome usado em public/sw.js. */
export const MEDIA_CACHE = "geologar-media-v1";

export interface DownloadItem {
  url: string;
  bytes: number;
}

export type DownloadStatus =
  | "idle" // ainda não começou
  | "downloading"
  | "done" // tudo no aparelho
  | "partial" // terminou com falhas (o que falhou continua pela rede)
  | "update" // já baixada, mas há arquivos novos/alterados (atualização da experiência)
  | "unsupported" // sem service worker / Cache Storage
  | "no-space"; // cota insuficiente

export interface DownloadState {
  status: DownloadStatus;
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
  failed: number;
  /** Bytes que faltam baixar (atualização / download incompleto). */
  missingBytes: number;
}

const INITIAL: DownloadState = { status: "idle", doneBytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: 0, failed: 0, missingBytes: 0 };

/** Ids de mídia na ordem em que o tour os usa (sem repetição). Música logo após a primeira cena. */
export function mediaDownloadOrder(tour: TourDefinition): string[] {
  const ids: string[] = [];
  const add = (id: string | undefined | null) => id && !ids.includes(id) && ids.push(id);
  const order: TourScene[] = [];
  for (let s = tour.scenes.find((x) => x.id === tour.firstScene); s && !order.includes(s); ) {
    order.push(s);
    s = tour.scenes.find((x) => x.id === s!.next);
  }
  for (const s of tour.scenes) if (!order.includes(s)) order.push(s); // cenas fora da sequência (menu)
  order.forEach((s, i) => {
    if (s.media.type === "image") add(s.media.src);
    else s.media.clips.forEach((c) => add(c.src));
    add(s.narration);
    for (const o of s.overlays) {
      add(o.src);
      o.slides?.forEach((sl) => add(sl.src));
    }
    if (i === 0) add(tour.music?.src);
  });
  for (const o of tour.credits.overlays) add(o.src);
  return ids;
}

export interface MediaCacheDeps {
  caches?: CacheStorage;
  fetch: typeof fetch;
  storage?: Pick<StorageManager, "estimate">;
  /** Resolve true quando há um service worker controlando a página (senão o cache não seria usado). */
  serviceWorkerReady: () => Promise<boolean>;
  concurrency?: number;
}

export class MediaCache {
  readonly store: Store<DownloadState> = createStore<DownloadState>({ ...INITIAL });
  private current: Promise<void> | null = null;
  private abort = new AbortController();

  constructor(private deps: MediaCacheDeps) {}

  /**
   * Baixa o que falta (o que já está no aparelho é pulado). Ignorado enquanto outro download roda;
   * depois de terminar, pode ser chamado de novo (ex.: "tentar de novo" após falha ou falta de espaço).
   */
  start(items: DownloadItem[]): Promise<void> {
    if (this.current) return this.current;
    const signal = this.abort.signal;
    this.current = this.run(items, signal).finally(() => (this.current = null));
    return this.current;
  }

  /**
   * Só CONFERE o que está no aparelho, sem baixar nem apagar (ao abrir a página):
   * nada salvo → "idle"; tudo salvo → "done"; salvo em parte ou de outra versão → "update".
   */
  async check(items: DownloadItem[]): Promise<void> {
    const { caches } = this.deps;
    if (!caches) return void this.store.set({ status: "unsupported" });
    if (!(await caches.has(MEDIA_CACHE))) return void this.store.set({ ...INITIAL });
    const cache = await caches.open(MEDIA_CACHE);
    const wanted = new Set(items.map((i) => i.url));
    const keys = (await cache.keys()).map((r) => r.url);
    const have = new Set(keys.filter((u) => wanted.has(u)));
    const stale = keys.length - have.size;
    const totalBytes = items.reduce((a, i) => a + i.bytes, 0);
    const doneBytes = items.filter((i) => have.has(i.url)).reduce((a, i) => a + i.bytes, 0);
    const base = { totalBytes, doneBytes, totalFiles: items.length, doneFiles: have.size, failed: 0, missingBytes: totalBytes - doneBytes };
    if (keys.length === 0) this.store.set({ ...INITIAL });
    else if (have.size === items.length && stale === 0) this.store.set({ ...base, status: "done" });
    else this.store.set({ ...base, status: "update" });
  }

  /** Para o download em andamento (se houver) e apaga tudo o que foi salvo. */
  async clear(): Promise<void> {
    this.abort.abort();
    this.abort = new AbortController();
    await this.current?.catch(() => {});
    await this.deps.caches?.delete(MEDIA_CACHE);
    this.store.set({ ...INITIAL });
  }

  private async run(items: DownloadItem[], signal: AbortSignal): Promise<void> {
    const { caches } = this.deps;
    if (!caches || !(await this.deps.serviceWorkerReady())) {
      this.store.set({ status: "unsupported" });
      return;
    }
    const cache = await caches.open(MEDIA_CACHE);

    // Limpa versões antigas e descobre o que já está no aparelho.
    const wanted = new Set(items.map((i) => i.url));
    const have = new Set<string>();
    for (const req of await cache.keys()) {
      if (wanted.has(req.url)) have.add(req.url);
      else await cache.delete(req);
    }
    const missing = items.filter((i) => !have.has(i.url));
    const totalBytes = items.reduce((a, i) => a + i.bytes, 0);
    const haveBytes = items.filter((i) => have.has(i.url)).reduce((a, i) => a + i.bytes, 0);
    this.store.set({ totalBytes, totalFiles: items.length, doneBytes: haveBytes, doneFiles: have.size, failed: 0, missingBytes: totalBytes - haveBytes });
    if (missing.length === 0) {
      this.store.set({ status: "done" });
      return;
    }

    const needed = missing.reduce((a, i) => a + i.bytes, 0);
    const est = await this.deps.storage?.estimate?.().catch(() => undefined);
    if (est?.quota !== undefined && est.quota - (est.usage ?? 0) < needed * 1.1) {
      this.store.set({ status: "no-space" });
      return;
    }

    this.store.set({ status: "downloading" });
    const failed: DownloadItem[] = [];
    await this.runQueue(cache, missing, failed, signal);
    // Segunda tentativa para o que falhou (rede oscilou).
    const retry = failed.splice(0);
    if (retry.length && !signal.aborted) await this.runQueue(cache, retry, failed, signal);
    if (signal.aborted) return;
    const missingBytes = failed.reduce((a, i) => a + i.bytes, 0);
    this.store.set({ status: failed.length ? "partial" : "done", failed: failed.length, missingBytes });
  }

  dispose(): void {
    this.abort.abort();
  }

  private async runQueue(cache: Cache, queue: DownloadItem[], failed: DownloadItem[], signal: AbortSignal) {
    let next = 0;
    const worker = async () => {
      while (next < queue.length && !signal.aborted) {
        const item = queue[next++];
        try {
          await this.download(cache, item, signal);
          this.store.set((s) => ({ doneFiles: s.doneFiles + 1 }));
        } catch {
          if (!signal.aborted) failed.push(item);
        }
      }
    };
    await Promise.all(Array.from({ length: this.deps.concurrency ?? 2 }, worker));
  }

  /** Baixa um arquivo inteiro para o cache, contando o progresso enquanto os bytes chegam. */
  private async download(cache: Cache, item: DownloadItem, signal: AbortSignal) {
    const res = await this.deps.fetch(item.url, { signal, cache: "no-store" });
    if (!res.ok || res.status !== 200) throw new Error(`HTTP ${res.status}`);
    let counted = 0;
    const count = (n: number) => {
      if (signal.aborted) return; // apagado/cancelado: o progresso já foi zerado
      counted += n;
      this.store.set((s) => ({ doneBytes: s.doneBytes + n }));
    };
    try {
      if (res.body) {
        const [toCache, toCount] = res.body.tee();
        const reader = toCount.getReader();
        const counting = (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            count(value.byteLength);
          }
        })();
        await Promise.all([cache.put(item.url, new Response(toCache, { headers: res.headers })), counting]);
      } else {
        await cache.put(item.url, res);
      }
      // Ajusta a contagem ao tamanho do manifest (Content-Encoding/estimativas).
      if (counted !== item.bytes) this.store.set((s) => ({ doneBytes: s.doneBytes - counted + item.bytes }));
    } catch (e) {
      if (!signal.aborted) this.store.set((s) => ({ doneBytes: s.doneBytes - counted }));
      await cache.delete(item.url).catch(() => false);
      throw e;
    }
  }
}

/** Espera um service worker assumir a página (no primeiro acesso ele assume logo após ativar). */
export function waitForServiceWorker(timeoutMs = 4000): Promise<boolean> {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw) return Promise.resolve(false);
  if (sw.controller) return Promise.resolve(true);
  return sw.getRegistration().then((reg) => {
    if (!reg) return false; // nenhum worker registrado (dev, `?nosw`)
    return new Promise<boolean>((resolve) => {
      const done = () => resolve(!!sw.controller);
      sw.addEventListener("controllerchange", done, { once: true });
      setTimeout(done, timeoutMs);
    });
  });
}
