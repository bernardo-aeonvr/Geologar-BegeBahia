import type { TourApp } from "../app/createTourApp";
import { useStore } from "../lib/store";
import { IconRestart } from "./Icons";

/**
 * Conclusão discreta sobre a vista panorâmica final (sem reinício automático).
 * "Recomeçar" limpa estado, para áudio/vídeo, descarta mídia e volta à primeira cena.
 */
export function EndScreen({ app }: { app: TourApp }) {
  const phase = useStore(app.store, (s) => s.phase);
  if (phase !== "finished") return null;
  return (
    <div className="end" role="dialog" aria-labelledby="end-title">
      <p className="end__eyebrow">Fim da experiência</p>
      <h2 id="end-title" className="end__title">
        Sua jornada pela geologia está apenas começando.
      </h2>
      <p className="end__body">Obrigado por explorar o Bege Bahia conosco.</p>
      <button className="btn btn--primary" onClick={() => void app.engine.restart()}>
        <IconRestart size={18} /> Recomeçar
      </button>
    </div>
  );
}
