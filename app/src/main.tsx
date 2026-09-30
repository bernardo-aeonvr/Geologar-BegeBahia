import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App";

// Sem <StrictMode>: ele monta efeitos duas vezes em desenvolvimento, o que criaria dois
// WebGLRenderer/AudioContext e pools de vídeo. O ciclo de vida da mídia é gerenciado à mão.
createRoot(document.getElementById("root")!).render(<App />);
