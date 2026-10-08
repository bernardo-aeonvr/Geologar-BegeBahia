import { useCallback, useEffect, useRef, useState } from "react";
import { createTourApp, type TourApp } from "../app/createTourApp";
import { detectViewMode, type ViewMode } from "../app/deviceMode";
import { appConfig } from "../config/appConfig";
import { useStore } from "../lib/store";
import { DebugPanel } from "./DebugPanel";
import { ErrorPanel } from "./ErrorPanel";
import { PopupLayer } from "./PopupLayer";
import { StartScreen } from "./StartScreen";
import { TourHud } from "./TourHud";

type Boot = { status: "loading" } | { status: "ready"; app: TourApp } | { status: "error"; message: string };

export function App() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  // Resolvido ANTES do clique: o pedido de sessão VR só é aceito dentro do gesto.
  const [viewMode, setViewMode] = useState<ViewMode>("flat");

  useEffect(() => {
    let cancelled = false;
    let created: TourApp | null = null;
    setBoot({ status: "loading" });
    createTourApp(viewerRef.current!).then(
      (app) => {
        if (cancelled) return app.dispose();
        created = app;
        setBoot({ status: "ready", app });
        if (import.meta.env.DEV || appConfig.debug) (window as unknown as { tour: TourApp }).tour = app;
      },
      (e: unknown) => !cancelled && setBoot({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [attempt]);

  useEffect(() => {
    if (!appConfig.enableXR) return;
    void detectViewMode(navigator as Parameters<typeof detectViewMode>[0], appConfig.forcedViewMode).then((mode) => {
      console.info("[app] modo de abertura", { mode });
      setViewMode(mode);
    });
  }, []);

  /**
   * "Iniciar": headset → entra direto em VR imersivo; celular/PC → panorama em tela cheia.
   * Tudo aqui roda DENTRO do gesto (pedido da sessão VR, desbloqueio de áudio, tela cheia).
   * Se o VR ou a tela cheia falharem ou forem recusados, o tour segue normalmente na janela.
   */
  const start = useCallback(() => {
    if (boot.status !== "ready") return;
    const { app } = boot;
    // Primeiro o pedido de VR: nada antes dele pode consumir a ativação do gesto.
    if (viewMode === "vr") {
      app.renderer
        .enterXR(() => console.info("[app] saiu do VR — o tour continua na tela"))
        .catch((e: unknown) => console.warn("[app] VR indisponível, seguindo na tela", e));
    }
    app.unlockAudio();
    // A tela cheia consome a ativação do gesto, por isso vem depois do desbloqueio de áudio.
    if (viewMode !== "vr") requestFullscreen();
    setStarted(true);
    void app.engine.start();
    // Baixa o resto da experiência para o aparelho enquanto ela já roda (ver MediaCache).
    app.startOfflineDownload();
  }, [boot, viewMode]);

  // Fim do tour (D10, revisada): volta direto ao menu inicial, com a primeira vista ao fundo.
  useEffect(() => {
    if (boot.status !== "ready" || !started) return;
    const { app } = boot;
    let leaving = false;
    const check = () => {
      if (leaving || app.store.get().phase !== "finished") return;
      leaving = true;
      void app.returnToStart().then(() => setStarted(false));
    };
    check();
    return app.store.subscribe(check);
  }, [boot, started]);

  return (
    <div className="stage">
      <div className="viewer" ref={viewerRef} />
      {boot.status === "ready" && started && <Running app={boot.app} xrAvailable={viewMode === "vr"} />}
      {!started && (
        <StartScreen
          status={boot.status}
          vr={viewMode === "vr"}
          errorMessage={boot.status === "error" ? boot.message : undefined}
          onStart={start}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}
      {boot.status === "ready" && <DebugPanel app={boot.app} initiallyOpen={appConfig.debug} />}
    </div>
  );
}

function Running({ app, xrAvailable }: { app: TourApp; xrAvailable: boolean }) {
  const phase = useStore(app.store, (s) => s.phase);
  return (
    <>
      <PopupLayer app={app} />
      {phase !== "finished" && phase !== "credits" && <TourHud app={app} xrAvailable={xrAvailable} />}
      <ErrorPanel app={app} />
    </>
  );
}

/** Pede tela cheia do documento (com prefixo do Safari). Falha silenciosa: o tour segue na janela. */
function requestFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    /* sem suporte */
  }
}
