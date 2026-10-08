/**
 * Service worker do Geologar 360: experiência disponível no aparelho (celular, Quest, offline).
 *
 * Divisão de trabalho:
 *  - A PÁGINA baixa a mídia para o Cache Storage (src/media/MediaCache.ts), na ordem do roteiro,
 *    quando a pessoa aperta "Iniciar". Este worker NÃO baixa nada sozinho.
 *  - Este worker só SERVE: mídia (…/media/…, exceto manifest.json) sai do cache quando existe;
 *    senão vai à rede, sem gravar (respostas parciais de vídeo não podem ser guardadas).
 *  - <video> e <audio> pedem pedaços (`Range: bytes=…`). Do cache, a resposta é fatiada aqui com
 *    206 + Content-Range — sem isso o Safari (iPhone) não toca vídeo vindo do cache.
 *  - Demais arquivos do app (HTML, JS, CSS, manifest.json, ícones): rede primeiro, cópia no cache
 *    "shell" como reserva → abre offline depois da primeira visita, e atualizações chegam sempre.
 *
 * O nome do cache de mídia é compartilhado com MediaCache.ts (MEDIA_CACHE). As URLs de mídia levam
 * `?v=<hash>` (MediaResolver), então uma variante regenerada nunca sai velha do cache.
 */
const MEDIA_CACHE = "geologar-media-v1";
const SHELL_CACHE = "geologar-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([MEDIA_CACHE, SHELL_CACHE]);
      for (const name of await caches.keys()) if (name.startsWith("geologar-") && !keep.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

function isMedia(url) {
  return url.pathname.includes("/media/") && !url.pathname.endsWith("/manifest.json");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isMedia(url)) event.respondWith(serveMedia(req));
  else event.respondWith(serveShell(req));
});

async function serveMedia(req) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(req.url);
  if (!cached) return fetch(req);
  const range = req.headers.get("range");
  if (!range) return cached;
  return sliceRange(cached, range);
}

/** Responde `Range: bytes=a-b | a- | -n` a partir de uma resposta completa do cache. */
async function sliceRange(full, rangeHeader) {
  const blob = await full.blob();
  const size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  let start, end;
  if (m && m[1] === "" && m[2] !== "") {
    start = Math.max(size - Number(m[2]), 0);
    end = size - 1;
  } else if (m && m[1] !== "") {
    start = Number(m[1]);
    end = m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start === undefined || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const type = full.headers.get("Content-Type") || blob.type || "application/octet-stream";
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

async function serveShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic" && !req.headers.get("range")) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const cached = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (cached) return cached;
    // Navegação offline para uma URL nunca visitada: devolve a página do app, se houver.
    if (req.mode === "navigate") {
      const index = await cache.match(new URL("./", self.registration.scope).toString());
      if (index) return index;
    }
    throw e;
  }
}
