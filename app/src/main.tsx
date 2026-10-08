import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App";

// Sem <StrictMode>: ele monta efeitos duas vezes em desenvolvimento, o que criaria dois
// WebGLRenderer/AudioContext e pools de vídeo. O ciclo de vida da mídia é gerenciado à mão.
createRoot(document.getElementById("root")!).render(<App />);

/**
 * Service worker (public/sw.js): serve do aparelho a mídia baixada por MediaCache e guarda o app
 * para uso offline. Ligado no build de produção; em dev só com `?sw` (o HMR do Vite e um worker
 * com cache se atrapalham). `?nosw` desliga e remove o worker deste site.
 */
const params = new URLSearchParams(location.search);
if ("serviceWorker" in navigator) {
  if (params.has("nosw")) {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
  } else if (import.meta.env.PROD || params.has("sw")) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((e: unknown) => console.warn("[sw] registro falhou — o tour segue pela rede", e));
  }
}
