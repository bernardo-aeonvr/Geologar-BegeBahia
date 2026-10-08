import { describe, expect, it } from "vitest";
import { MediaCache, MEDIA_CACHE, mediaDownloadOrder, type DownloadItem } from "../src/media/MediaCache";
import { tour } from "../src/tour/scenes";

/** Cache Storage mínimo em memória. */
function fakeCaches(initial: string[] = []) {
  const store = new Map<string, Response>(initial.map((u) => [u, new Response("old")]));
  const cache = {
    keys: async () => [...store.keys()].map((u) => new Request(u)),
    delete: async (r: Request | string) => store.delete(typeof r === "string" ? r : r.url),
    put: async (u: string, res: Response) => {
      await res.arrayBuffer(); // consome como o navegador faria
      store.set(u, new Response("ok"));
    },
    match: async (u: string) => store.get(u),
  };
  let exists = initial.length > 0;
  const caches = {
    open: async (name: string) => (expect(name).toBe(MEDIA_CACHE), (exists = true), cache),
    has: async () => exists,
    delete: async () => (store.clear(), (exists = false), true),
  } as unknown as CacheStorage;
  return { caches, store };
}

const items = (n: number): DownloadItem[] => Array.from({ length: n }, (_, i) => ({ url: `http://x/media/f${i}?v=1`, bytes: 10 }));
const okFetch = (async () => new Response(new Uint8Array(10), { status: 200 })) as unknown as typeof fetch;

describe("MediaCache — download da experiência para o aparelho", () => {
  it("ordem do roteiro: primeira cena antes de tudo, música logo depois, todas as cenas, sem repetição", () => {
    const ids = mediaDownloadOrder(tour);
    expect(ids.slice(0, 2)).toEqual(["panoramas/e0-intro", "audio/e0-intro"]);
    expect(ids.indexOf("audio/musica-ambiente")).toBeLessThan(ids.indexOf("panoramas/e1-p1"));
    expect(ids.indexOf("video/e3-p1-2")).toBeLessThan(ids.indexOf("video/e3-p1-1"));
    expect(ids.indexOf("audio/e4-p1")).toBeLessThan(ids.indexOf("audio/e5-p1"));
    expect(ids).toContain("creditos/4-cnpq");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("baixa só o que falta, apaga versões antigas e termina com 100%", async () => {
    const list = items(4);
    const { caches, store } = fakeCaches([list[0].url, "http://x/media/f1?v=OLD"]);
    const fetched: string[] = [];
    const mc = new MediaCache({
      caches,
      fetch: (async (u: string) => (fetched.push(u), new Response(new Uint8Array(10), { status: 200 }))) as unknown as typeof fetch,
      serviceWorkerReady: async () => true,
    });
    await mc.start(list);
    expect(fetched).toEqual(list.slice(1).map((i) => i.url));
    expect(store.has("http://x/media/f1?v=OLD")).toBe(false);
    expect(mc.store.get()).toMatchObject({ status: "done", doneBytes: 40, totalBytes: 40, doneFiles: 4, totalFiles: 4 });
  });

  it("sem service worker controlando a página → não baixa nada", async () => {
    let calls = 0;
    const mc = new MediaCache({ caches: fakeCaches().caches, fetch: (async () => (calls++, new Response(""))) as unknown as typeof fetch, serviceWorkerReady: async () => false });
    await mc.start(items(3));
    expect(mc.store.get().status).toBe("unsupported");
    expect(calls).toBe(0);
  });

  it("sem espaço suficiente → não baixa", async () => {
    const mc = new MediaCache({
      caches: fakeCaches().caches,
      fetch: okFetch,
      storage: { estimate: async () => ({ quota: 25, usage: 0 }) },
      serviceWorkerReady: async () => true,
    });
    await mc.start(items(3));
    expect(mc.store.get().status).toBe("no-space");
  });

  it("falha de rede: tenta de novo; o que falhar duas vezes fica pela internet", async () => {
    const tries: Record<string, number> = {};
    const flaky = (async (u: string) => {
      tries[u] = (tries[u] ?? 0) + 1;
      if (u.includes("f1") && tries[u] === 1) throw new Error("rede caiu"); // falha só na 1ª vez
      if (u.includes("f2")) return new Response("", { status: 503 }); // sempre falha
      return new Response(new Uint8Array(10), { status: 200 });
    }) as unknown as typeof fetch;
    const { caches, store } = fakeCaches();
    const mc = new MediaCache({ caches, fetch: flaky, serviceWorkerReady: async () => true });
    await mc.start(items(3));
    expect(mc.store.get()).toMatchObject({ status: "partial", failed: 1, doneFiles: 2, doneBytes: 20 });
    expect(store.has("http://x/media/f2?v=1")).toBe(false);
  });

  it("tentar de novo depois de download incompleto baixa só o que faltou", async () => {
    let down = true;
    const fetched: string[] = [];
    const f = (async (u: string) => {
      fetched.push(u);
      if (down && u.includes("f1")) return new Response("", { status: 503 });
      return new Response(new Uint8Array(10), { status: 200 });
    }) as unknown as typeof fetch;
    const mc = new MediaCache({ caches: fakeCaches().caches, fetch: f, serviceWorkerReady: async () => true });
    await mc.start(items(3));
    expect(mc.store.get().status).toBe("partial");
    down = false;
    fetched.length = 0;
    await mc.start(items(3));
    expect(fetched).toEqual(["http://x/media/f1?v=1"]);
    expect(mc.store.get()).toMatchObject({ status: "done", failed: 0, doneBytes: 30, doneFiles: 3 });
  });

  it("check: só confere — nada salvo / tudo salvo / atualização (arquivo novo ou de outra versão)", async () => {
    const list = items(3);
    let calls = 0;
    const f = (async () => (calls++, new Response(""))) as unknown as typeof fetch;
    const ready = async () => true;

    const none = new MediaCache({ caches: fakeCaches().caches, fetch: f, serviceWorkerReady: ready });
    await none.check(list);
    expect(none.store.get().status).toBe("idle");

    const all = new MediaCache({ caches: fakeCaches(list.map((i) => i.url)).caches, fetch: f, serviceWorkerReady: ready });
    await all.check(list);
    expect(all.store.get()).toMatchObject({ status: "done", missingBytes: 0 });

    // Lançamos uma atualização: f2 mudou (outro ?v=) → 10 bytes a baixar; a versão velha não é apagada só por conferir.
    const { caches, store } = fakeCaches([list[0].url, list[1].url, "http://x/media/f2?v=OLD"]);
    const upd = new MediaCache({ caches, fetch: f, serviceWorkerReady: ready });
    await upd.check(list);
    expect(upd.store.get()).toMatchObject({ status: "update", missingBytes: 10, doneFiles: 2 });
    expect(store.has("http://x/media/f2?v=OLD")).toBe(true);
    expect(calls).toBe(0);

    // "Atualização disponível · baixar": baixa só o novo e remove o velho.
    await upd.start(list);
    expect(calls).toBe(1);
    expect(store.has("http://x/media/f2?v=OLD")).toBe(false);
    expect(upd.store.get().status).toBe("done");
  });

  it("clear: apaga tudo e volta ao início; no meio do download, cancela sem bagunçar o progresso", async () => {
    const list = items(4);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = (async (u: string, init?: RequestInit) => {
      if (u.includes("f2")) {
        await gate;
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      }
      return new Response(new Uint8Array(10), { status: 200 });
    }) as unknown as typeof fetch;
    const { caches, store } = fakeCaches();
    const mc = new MediaCache({ caches, fetch: slow, serviceWorkerReady: async () => true, concurrency: 1 });
    const running = mc.start(list);
    await new Promise((r) => setTimeout(r, 10));
    expect(mc.store.get().status).toBe("downloading");
    const clearing = mc.clear();
    release();
    await clearing;
    await running;
    expect(store.size).toBe(0);
    expect(mc.store.get()).toMatchObject({ status: "idle", doneBytes: 0, doneFiles: 0 });
  });

  it("idempotente: segundo start não baixa de novo", async () => {
    let calls = 0;
    const mc = new MediaCache({ caches: fakeCaches().caches, fetch: (async () => (calls++, new Response(new Uint8Array(10)))) as unknown as typeof fetch, serviceWorkerReady: async () => true });
    await mc.start(items(2));
    await mc.start(items(2));
    expect(calls).toBe(2);
  });
});
