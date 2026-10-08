/**
 * Desativação do service worker de download offline (removido em 2026-10-08).
 * Aparelhos que já o instalaram buscam este arquivo na próxima visita: ele apaga os caches
 * "geologar-*" (até ~450 MB), cancela o próprio registro e recarrega as abas abertas, que voltam
 * a carregar tudo direto da rede. Pode ser apagado quando não houver mais aparelhos com o antigo.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith("geologar-")) await caches.delete(name);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
