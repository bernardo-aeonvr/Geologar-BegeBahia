import { useEffect, useState } from "react";
import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";

const fmt = (t: number) => (Number.isFinite(t) ? t.toFixed(2) : "—");

/**
 * Painel de debug (?debug=1 ou Shift+D). Lê dados de alta frequência direto dos controladores
 * a 4 Hz — só este painel re-renderiza, o resto da UI não.
 */
export function DebugPanel({ app, initiallyOpen }: { app: TourApp; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [, force] = useState(0);
  const s = useStore(app.store, (x) => x);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;
  const d = app.engine.getDebugInfo();
  const scene = s.sceneId ? app.engine.getScene(s.sceneId) : null;
  const media = scene?.media;
  const panorama = media?.type === "image" ? media.src : media?.clips.map((c) => c.src).join(" → ");

  const rows: [string, string][] = [
    ["cena", `${s.sceneId ?? "—"} (${s.sceneIndex + 1}/${s.sceneCount})`],
    ["fase", s.phase],
    ["token", String(d.token)],
    ["panorama", `${panorama ?? "—"} [${s.panorama}]`],
    ["áudio", `${scene?.narration ?? "—"} [${s.narration}]`],
    ["áudio t", `${fmt(d.narrationTime)} / ${fmt(d.narrationDuration)}`],
    ["narração fim", String(d.narrationFinished)],
    ["exitRequested", String(d.exitRequested)],
    ["clip", d.video ? `${d.video.clipIndex + 1}/${s.video?.clipCount} ciclo ${d.video.videoCycle}${d.video.holding ? " (congelado)" : ""}` : "—"],
    ["clip t", d.video ? `${fmt(d.video.time)} / ${fmt(d.video.duration)}` : "—"],
    ["clips ok", s.video ? s.video.clipsCompleted.map((c) => (c ? "■" : "□")).join(" ") : "—"],
    ["próxima", s.nextSceneId ?? "(fim)"],
    ["preload", `${s.preload.sceneId ?? "—"} [${s.preload.status}]`],
    ["transição", `${d.transitioning ? "sim" : "não"}${d.pendingTarget ? ` → fila: ${d.pendingTarget}` : ""}`],
    ["perfis", `img ${app.resolver.profiles.image} · vídeo ${app.resolver.profiles.video}`],
    ["audioctx", app.bus.state],
    ["erro", s.error ? `${s.error.kind}: ${s.error.message}` : "—"],
  ];

  return (
    <aside className="debug" aria-label="Debug">
      <div className="debug__head">
        <strong>debug</strong>
        <button onClick={() => setOpen(false)} aria-label="Fechar debug">
          ×
        </button>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>pool de vídeo / cache</summary>
        <pre>{JSON.stringify({ video: app.video.debugInfo(), cache: app.preloader.status() }, null, 1)}</pre>
      </details>
    </aside>
  );
}
