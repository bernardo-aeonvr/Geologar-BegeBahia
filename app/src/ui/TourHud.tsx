import { useEffect, useRef, useState } from "react";
import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import { IconList, IconMuted, IconNext, IconPause, IconPlay, IconPrev, IconVolume, IconVR } from "./Icons";
import { DownloadStatus } from "./DownloadStatus";
import { SceneMenu } from "./SceneMenu";

/**
 * Interface discreta sobre o panorama: só os controles embaixo (sem faixa no topo — a vista fica livre).
 * Some após alguns segundos sem interação durante a reprodução; qualquer toque/tecla a traz de volta
 * (não depende de hover).
 */
export function TourHud({ app, xrAvailable }: { app: TourApp; xrAvailable: boolean }) {
  const { engine, store, tour } = app;
  const sceneId = useStore(store, (s) => s.sceneId);
  const sceneIndex = useStore(store, (s) => s.sceneIndex);
  const phase = useStore(store, (s) => s.phase);
  const muted = useStore(store, (s) => s.muted);
  const volume = useStore(store, (s) => s.volume);
  const [menuOpen, setMenuOpen] = useState(false);
  const idle = useIdle(phase === "playing" && !menuOpen, 4000);

  const busy = phase === "transitioning" || phase === "loading";
  const paused = phase === "paused";
  const canToggle = phase === "playing" || phase === "paused";

  return (
    <div className={`hud ${idle ? "hud--idle" : ""}`}>
      {busy && <div className="hud__spinner" role="status" aria-label="Carregando" />}

      <nav className="hud__controls" aria-label="Controles do tour">
        <button className="icon-btn" onClick={() => void engine.prev()} aria-label="Cena anterior" disabled={sceneIndex <= 0}>
          <IconPrev />
        </button>
        <button
          className="icon-btn icon-btn--main"
          onClick={() => void engine.togglePause()}
          aria-label={paused ? "Continuar" : "Pausar"}
          disabled={!canToggle}
        >
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <button className="icon-btn" onClick={() => void engine.next()} aria-label="Próxima cena">
          <IconNext />
        </button>
        <span className="hud__sep" />
        <button className="icon-btn" onClick={() => engine.toggleMute()} aria-label={muted ? "Ativar som" : "Silenciar"} aria-pressed={muted}>
          {muted ? <IconMuted /> : <IconVolume />}
        </button>
        <input
          className="hud__volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => engine.setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Escolher cena">
          <IconList />
        </button>
        {xrAvailable && (
          <button className="icon-btn" onClick={() => app.renderer.enterXR().catch((e: unknown) => console.warn("[app] VR indisponível", e))} aria-label="Entrar em VR">
            <IconVR />
          </button>
        )}
      </nav>

      {menuOpen && (
        <SceneMenu
          scenes={tour.scenes}
          currentId={sceneId}
          onPick={(id) => {
            setMenuOpen(false);
            void engine.goToScene(id);
          }}
          onClose={() => setMenuOpen(false)}
          footer={<DownloadStatus app={app} />}
        />
      )}
    </div>
  );
}

function useIdle(active: boolean, ms: number): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer.current);
      if (active) timer.current = window.setTimeout(() => setIdle(true), ms);
    };
    wake();
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [active, ms]);
  return idle && active;
}
