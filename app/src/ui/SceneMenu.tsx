import { useEffect, type ReactNode } from "react";
import type { TourScene } from "../types/tour";
import { IconClose } from "./Icons";

interface Props {
  scenes: TourScene[];
  currentId: string | null;
  onPick(id: string): void;
  onClose(): void;
  /** Rodapé do painel (ex.: progresso do download para o aparelho). */
  footer?: ReactNode;
}

/** Lista de cenas para navegação manual (interrompe a cena atual imediatamente). */
export function SceneMenu({ scenes, currentId, onPick, onClose, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let lastStage = "";
  return (
    <div className="menu" role="dialog" aria-label="Cenas do tour" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="menu__panel">
        <div className="menu__head">
          <h2>Cenas</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <IconClose />
          </button>
        </div>
        <ol className="menu__list">
          {scenes.map((s, i) => {
            const showStage = s.stage !== lastStage;
            lastStage = s.stage;
            return (
              <li key={s.id}>
                {showStage && <p className="menu__stage">{s.stage}</p>}
                <button className={`menu__item ${s.id === currentId ? "menu__item--current" : ""}`} onClick={() => onPick(s.id)} aria-current={s.id === currentId}>
                  <span className="menu__num">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                  {s.media.type === "video" && <span className="menu__tag">vídeo</span>}
                </button>
              </li>
            );
          })}
        </ol>
        {footer}
      </div>
    </div>
  );
}
