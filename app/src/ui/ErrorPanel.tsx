import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";

const TEXT: Record<string, { title: string; body: string }> = {
  panorama: { title: "O panorama não carregou", body: "Verifique a conexão e tente novamente." },
  video: { title: "O vídeo não carregou", body: "Verifique a conexão e tente novamente, ou pule esta cena." },
  narration: { title: "A narração não carregou", body: "Tente novamente ou continue sem a narração desta cena." },
  "narration-stalled": { title: "A narração parou", body: "A conexão pode estar lenta. Tente novamente ou continue sem narração." },
  autoplay: { title: "Toque para continuar", body: "O navegador pausou o áudio. Toque para retomar a experiência." },
};

/** Nenhum erro congela o tour: sempre há uma ação para seguir. */
export function ErrorPanel({ app }: { app: TourApp }) {
  const error = useStore(app.store, (s) => s.error);
  if (!error) return null;
  const t = TEXT[error.kind] ?? { title: "Algo deu errado", body: error.message };
  const { engine } = app;
  const isNarration = error.kind === "narration" || error.kind === "narration-stalled";

  return (
    <div className={`notice ${error.kind === "autoplay" ? "notice--center" : ""}`} role="alert">
      <p className="notice__title">{t.title}</p>
      <p className="notice__body">{t.body}</p>
      <div className="notice__actions">
        {error.kind === "autoplay" ? (
          <button className="btn btn--primary" onClick={() => void engine.unblockAutoplay()}>
            Continuar
          </button>
        ) : (
          <>
            <button className="btn btn--primary" onClick={() => void engine.retry()}>
              Tentar novamente
            </button>
            {isNarration ? (
              <button className="btn" onClick={() => engine.continueWithoutNarration()}>
                Continuar sem narração
              </button>
            ) : (
              <button className="btn" onClick={() => void engine.next()}>
                Pular cena
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
