import { useCallback, useEffect, useRef, useState } from "react";
import { createTourApp, type TourApp } from "../app/createTourApp";
import { appConfig } from "../config/appConfig";
import { useStore } from "../lib/store";
import { DebugPanel } from "./DebugPanel";
import { EndScreen } from "./EndScreen";
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
  const [xrAvailable, setXrAvailable] = useState(false);

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
    if (!appConfig.enableXR || !navigator.xr) return;
    navigator.xr.isSessionSupported("immersive-vr").then(setXrAvailable, () => setXrAvailable(false));
  }, []);

  const start = useCallback(() => {
    if (boot.status !== "ready") return;
    boot.app.unlockAudio(); // precisa acontecer DENTRO do gesto
    setStarted(true);
    void boot.app.engine.start();
  }, [boot]);

  return (
    <div className="stage">
      <div className="viewer" ref={viewerRef} />
      {boot.status === "ready" && started && <Running app={boot.app} xrAvailable={xrAvailable} />}
      {!started && (
        <StartScreen
          status={boot.status}
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
      <EndScreen app={app} />
    </>
  );
}
