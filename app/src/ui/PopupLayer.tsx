import { useEffect, useRef, useState } from "react";
import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import type { Overlay } from "../types/tour";

const EXIT_MS = 350;

interface Shown {
  overlay: Overlay;
  leaving: boolean;
}

/**
 * Camada de pop-ups em HUD (overlays SEM `anchor`: créditos, avisos). Os pop-ups com `anchor`
 * ficam presos ao panorama e são desenhados pelo renderer (viewer/SpatialOverlays).
 * Quem decide QUANDO mostrar é o motor (cues em scenes.ts → store.activeOverlays);
 * aqui só se desenha, com entrada/saída suaves. Não captura toques: o arraste do panorama continua.
 */
export function PopupLayer({ app }: { app: TourApp }) {
  const active = useStore(app.store, (s) => s.activeOverlays);
  const sceneId = useStore(app.store, (s) => s.sceneId);
  const [shown, setShown] = useState<Shown[]>([]);
  const timer = useRef<number>(0);

  useEffect(() => {
    const scene = sceneId ? app.engine.getScene(sceneId) : null;
    const pool: Overlay[] = [...(scene?.overlays ?? []), ...app.tour.credits.overlays];
    // Overlays com `anchor` são espaciais (desenhados no panorama pelo renderer), não HUD.
    const current = active.map((id) => pool.find((o) => o.id === id)).filter((o): o is Overlay => !!o && !o.anchor);

    setShown((prev) => [
      ...current.map((overlay) => ({ overlay, leaving: false })),
      ...prev.filter((p) => !current.some((o) => o.id === p.overlay.id)).map((p) => ({ ...p, leaving: true })),
    ]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown((prev) => prev.filter((p) => !p.leaving)), EXIT_MS);
    return () => window.clearTimeout(timer.current);
  }, [active, sceneId, app]);

  if (shown.length === 0) return null;

  return (
    <div className="popups" aria-live="polite">
      {shown.map(({ overlay: o, leaving }) => (
        <figure
          key={o.id}
          className={[
            "popup",
            `popup--${o.placement ?? "corner"}`,
            o.compact ? "popup--compact" : "",
            o.bare ? "popup--bare" : "",
            leaving ? "popup--leaving" : "",
          ].join(" ")}
        >
          {o.kind === "image" && o.src && <img src={app.resolver.url(o.src)} alt={o.alt ?? o.title ?? ""} draggable={false} />}
          {o.kind === "video" && o.src && <video src={app.resolver.url(o.src)} autoPlay muted playsInline loop />}
          {(o.title || o.body) && (
            <figcaption>
              {o.title && <strong>{o.title}</strong>}
              {o.body && <span>{o.body}</span>}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
