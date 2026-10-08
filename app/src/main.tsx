import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App";

// Sem <StrictMode>: ele monta efeitos duas vezes em desenvolvimento, o que criaria dois
// WebGLRenderer/AudioContext e pools de vídeo. O ciclo de vida da mídia é gerenciado à mão.
createRoot(document.getElementById("root")!).render(<App />);

// Limpeza do download offline removido: tira o service worker antigo e o cache que ele deixou.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
}
if (typeof caches !== "undefined") {
  void caches.keys().then((names) => names.filter((n) => n.startsWith("geologar-")).forEach((n) => void caches.delete(n)));
}
