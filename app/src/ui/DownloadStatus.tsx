import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import { IconCheck, IconDownload } from "./Icons";

const mb = (b: number) => `${Math.round(b / 1e6)} MB`;

/** Progresso do download da experiência para o aparelho (rodapé do menu de cenas). */
export function DownloadStatus({ app }: { app: TourApp }) {
  const s = useStore(app.download, (x) => x);
  if (s.status === "idle" || s.status === "unsupported" || s.status === "update") return null;
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
 * Rodapé discreto do menu inicial: download para uso offline.
 *  - nada salvo → "Baixar para usar offline · N MB"
 *  - baixando → progresso + "Cancelar" (apaga o que já veio)
 *  - salvo → "✓ Disponível offline" + "Baixar novamente" / "Apagar"
 *  - atualização (arquivos novos no servidor) ou incompleto → baixar o que falta + "Apagar"
 */
export function OfflineButton({ app }: { app: TourApp }) {
  const s = useStore(app.download, (x) => x);
  if (!app.offlineSupported || s.status === "unsupported") return null;
  const pct = s.totalBytes ? Math.min(100, Math.floor((s.doneBytes / s.totalBytes) * 100)) : 0;
  const remove = <LinkButton onClick={() => void app.removeOffline()}>Apagar</LinkButton>;

  if (s.status === "downloading")
    return (
      <div className="offline" role="status" aria-live="polite">
        <span className="offline__text">
          Baixando para este aparelho… {pct}% ({mb(s.doneBytes)} de {mb(s.totalBytes)})
        </span>
        <div className="offline__bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="offline__links">
          <LinkButton onClick={() => void app.removeOffline()}>Cancelar</LinkButton>
        </span>
      </div>
    );
  if (s.status === "done")
    return (
      <div className="offline" role="status">
        <span className="offline__text">
          <IconCheck size={14} /> Disponível offline neste aparelho
        </span>
        <span className="offline__links">
          <LinkButton onClick={() => void app.redownloadOffline()}>Baixar novamente</LinkButton>
          <span aria-hidden>·</span>
          {remove}
        </span>
      </div>
    );
  const saved = s.status === "update" || s.status === "partial";
  const label =
    s.status === "update"
      ? `Atualização disponível · baixar ${mb(s.missingBytes)}`
      : s.status === "partial"
        ? `Download incompleto · continuar (${mb(s.missingBytes)})`
        : s.status === "no-space"
          ? `Sem espaço no aparelho (${mb(app.offlineBytes)}) · tentar de novo`
          : `Baixar para usar offline · ${mb(app.offlineBytes)}`;
  return (
    <div className="offline">
      <button className="offline__btn" onClick={() => app.startOfflineDownload()}>
        <IconDownload size={14} /> {label}
      </button>
      {saved && <span className="offline__links">{remove}</span>}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick(): void; children: React.ReactNode }) {
  return (
    <button className="offline__link" onClick={onClick}>
      {children}
    </button>
  );
}
