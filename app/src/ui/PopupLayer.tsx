import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import type { Overlay } from "../types/tour";

/**
 * Camada de pop-ups/overlays (cues da narração, créditos, hotspots).
 * Infraestrutura pronta; o conteúdo chega com os materiais pendentes (D5).
 */
export function PopupLayer({ app }: { app: TourApp }) {
  const active = useStore(app.store, (s) => s.activeOverlays);
  const sceneId = useStore(app.store, (s) => s.sceneId);
  if (active.length === 0) return null;

  const scene = sceneId ? app.engine.getScene(sceneId) : null;
  const pool: Overlay[] = [...(scene?.overlays ?? []), ...app.tour.credits.overlays];
  const items = active.map((id) => pool.find((o) => o.id === id)).filter((o): o is Overlay => !!o);

  return (
    <div className="popups" aria-live="polite">
      {items.map((o) => (
        <figure key={o.id} className={`popup popup--${o.placement ?? "corner"} ${o.compact ? "popup--compact" : ""}`}>
          {o.kind === "image" && o.src && <img src={app.resolver.url(o.src)} alt={o.title ?? ""} />}
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
