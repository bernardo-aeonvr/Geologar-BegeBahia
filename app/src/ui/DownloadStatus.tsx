import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import { IconCheck, IconDownload } from "./Icons";

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

/**
 * Botão discreto do menu inicial: "Baixar para usar offline". Depois de clicado, mostra o
 * progresso; ao terminar, só confirma que a experiência está no aparelho.
 */
export function OfflineButton({ app }: { app: TourApp }) {
  const s = useStore(app.download, (x) => x);
  if (!app.offlineSupported || s.status === "unsupported") return null;
  const pct = s.totalBytes ? Math.min(100, Math.floor((s.doneBytes / s.totalBytes) * 100)) : 0;

  if (s.status === "downloading")
    return (
      <div className="offline" role="status" aria-live="polite">
        <span className="offline__text">
          Baixando para este aparelho… {pct}% ({mb(s.doneBytes)} de {mb(s.totalBytes)})
        </span>
        <div className="offline__bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  if (s.status === "done")
    return (
      <div className="offline" role="status">
        <span className="offline__text">
          <IconCheck size={14} /> Disponível offline neste aparelho
        </span>
      </div>
    );
  const label =
    s.status === "partial"
      ? "Download incompleto — tentar de novo"
      : s.status === "no-space"
        ? `Sem espaço no aparelho (${mb(app.offlineBytes)}) — tentar de novo`
        : `Baixar para usar offline · ${mb(app.offlineBytes)}`;
  return (
    <div className="offline">
      <button className="offline__btn" onClick={() => app.startOfflineDownload()}>
        <IconDownload size={14} /> {label}
      </button>
    </div>
  );
}
