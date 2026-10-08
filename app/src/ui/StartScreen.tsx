import { IconDrag, IconPlay } from "./Icons";

interface Props {
  status: "loading" | "ready" | "error";
  /** Headset: a experiência abre direto em VR ao iniciar. */
  vr?: boolean;
  errorMessage?: string;
  onStart(): void;
  onRetry(): void;
}

/**
 * Tela inicial. O clique/toque em "Iniciar experiência" é o gesto que libera o áudio
 * (política de autoplay dos navegadores) — depois dele, as narrações seguem sozinhas.
 */
export function StartScreen({ status, vr = false, errorMessage, onStart, onRetry }: Props) {
  return (
    <div className="start" role="dialog" aria-labelledby="start-title">
      <div className="start__inner">
        <h1 id="start-title" style={{ margin: 0 }}>
          <img className="start__logo" src={`${import.meta.env.BASE_URL}brand/logo-geologar.png`} alt="Geologar" draggable={false} />
        </h1>
        <p className="start__lede">Do sertão baiano para o mundo: a jornada de uma rocha, da pedreira em Ourolândia até a serraria.</p>

        {status === "error" ? (
          <div className="start__error" role="alert">
            <p>Não foi possível carregar a experiência.</p>
            {errorMessage && <p className="start__error-detail">{errorMessage}</p>}
            <button className="btn btn--primary" onClick={onRetry}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <button className="btn btn--primary btn--start" onClick={onStart} disabled={status !== "ready"} autoFocus>
            <IconPlay size={20} />
            {status === "ready" ? "Iniciar experiência" : "Preparando…"}
          </button>
        )}

        <ul className="start__hints">
          <li>
            <IconDrag size={18} /> {vr ? "Mova a cabeça para olhar ao redor" : "Arraste para olhar ao redor"}
          </li>
          <li>🎧 Melhor com fones de ouvido</li>
        </ul>
      </div>
    </div>
  );
}
