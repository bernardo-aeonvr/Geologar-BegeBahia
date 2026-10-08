import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";

const mb = (b: number) => `${Math.round(b / 1e6)} MB`;

/** Progresso do download da experiência para o aparelho (rodapé do menu de cenas). */
export function DownloadStatus({ app }: { app: TourApp }) {
  const s = useStore(app.download, (x) => x);
  if (s.status === "idle" || s.status === "unsupported") return null;
  const pct = s.totalBytes ? Math.min(100, Math.floor((s.doneBytes / s.totalBytes) * 100)) : 0;
  const text =
    s.status === "downloading"
      ? `Baixando a experiência para este aparelho… ${pct}% (${mb(s.doneBytes)} de ${mb(s.totalBytes)})`
      : s.status === "done"
        ? "Experiência salva neste aparelho: funciona mesmo sem internet."
        : s.status === "partial"
          ? `Experiência salva em parte (${s.failed} arquivo(s) continuam pela internet).`
          : "Sem espaço para salvar a experiência neste aparelho: ela continua pela internet.";
  return (
    <div className="download" role="status" aria-live="polite">
      <p className="download__text">{text}</p>
      {s.status === "downloading" && (
        <div className="download__bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
