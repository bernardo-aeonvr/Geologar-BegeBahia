/**
 * POP-UPS DO TOUR — configuração central (fonte única).
 *
 * Para mudar imagem, tempo, posição, escala ou ordem, edite SOMENTE este arquivo.
 * Documentação completa: ../../POPUPS_IMPLEMENTATION.md · assets ausentes: ../../MISSING_POPUPS.md
 *
 * Tempos: segundos no relógio da NARRAÇÃO da cena (fonte de verdade). O pop-up/slide visível é
 *   sempre derivado de `narration.currentTime` (pausa, seek, volta e reinício funcionam sozinhos).
 *   `end` omitido = até o fim da cena (inclusive loops de vídeo depois da narração).
 *   Medidos por transcrição com timestamps de palavra das narrações (ver documentação).
 *
 * Posição: ponto do panorama onde o painel fica preso (mesma convenção do initialView):
 *   yaw   0 = centro da imagem 360, positivo = direita (graus)
 *   pitch 0 = horizonte, positivo = acima (graus)
 *   width = largura angular do painel (graus) — a altura segue a proporção da imagem.
 *
 * Imagens: ids lógicos de mídia (ver media-sources.json → `npm run media`). Um id ainda sem
 * arquivo no manifest simplesmente não é exibido (sem placeholder). Marque `pending` com a
 * descrição esperada — o teste confere que só os pendentes podem faltar.
 */
import type { Cue, Overlay, OverlayCrop, TourScene } from "../types/tour";

export interface PopupPosition {
  yaw: number;
  pitch: number;
  width: number;
  roll?: number;
}

interface PopupBase {
  id: string;
  /** Texto alternativo (o conteúdo está na imagem). */
  alt: string;
  position: PopupPosition;
  /** Asset ainda não entregue: descrição do que é esperado (ver MISSING_POPUPS.md). */
  pending?: string;
}

/** Uma imagem, visível de `start` a `end`. */
export interface SinglePopup extends PopupBase {
  type: "single";
  image: string;
  start: number;
  end?: number;
  /** Mostra só esta região da imagem (sem deformar). */
  crop?: OverlayCrop;
}

/** Sequência no MESMO painel: a imagem muda conforme a narração avança. */
export interface SequencePopup extends PopupBase {
  type: "sequence";
  slides: { image: string; start: number; end?: number; note?: string }[];
}

/** Vídeo sincronizado à narração (t do vídeo = t da narração − start). */
export interface VideoPopup extends PopupBase {
  type: "video";
  video: string;
  start: number;
  end: number;
  chromaKey?: string;
  /** Enquadra só a região onde a animação acontece (sem deformar). */
  crop?: OverlayCrop;
}

export type PopupDef = SinglePopup | SequencePopup | VideoPopup;

/** Largura padrão (graus). */
const W = 42;

export const popupTimeline: Record<string, PopupDef[]> = {
  // ── Introdução ────────────────────────────────────────────────────────────────────────────
  intro: [
    {
      // A partir de "Bem-vindo a uma jornada imersiva." (17,2 s) até o fim da cena.
      type: "single",
      id: "salvador-ourolandia",
      image: "popups/g2-salvador-ourolandia",
      alt: "Mapa da Bahia: de Salvador a Ourolândia, cerca de 406 km",
      start: 17.1,
      position: { yaw: 30, pitch: 14, width: 40 },
      // Usa a versão derivada com alpha correto (o original veio com fundo preto fora do cartão
      // arredondado): Popups (Geologar 2)/derivados/, gerada por scripts/black-to-alpha.py.
    },
  ],

  // ── Etapa 1 · Ponto 1 — Estrada ─────────────────────────────────────────────────────────
  "e1-p1": [
    {
      // "…o material lembrava o famoso travertino romano. Nascia assim… Bege Bahia."
      type: "single",
      id: "bege-x-travertino",
      image: "popups/g2-bege-x-travertino",
      alt: "Comparação: Bege Bahia e Travertino Romano/Turco",
      start: 35.5,
      position: { yaw: 32, pitch: 13, width: W },
    },
  ],

  // ── Etapa 1 · Ponto 2 — Topo da pedreira ────────────────────────────────────────────────
  "e1-p2": [
    {
      // "Ele é um calcrete, uma rocha sedimentar formada em ambiente continental." (4,1–12,0 s)
      type: "single",
      id: "calcrete-x-bege",
      image: "popups/g2-calcrete-x-bege",
      alt: "Comparação: calcrete e Bege Bahia",
      start: 4.1,
      end: 12.0,
      position: { yaw: 32, pitch: 15, width: W },
      pending: "Comparação visual Calcrete × Bege Bahia",
    },
    {
      // Fotomicrografias (Santos et al., 2020): uma por frase, a partir do fim do trecho do calcrete.
      type: "sequence",
      id: "fotomicrografias",
      alt: "Fotomicrografias do Bege Bahia (Santos et al., 2020)",
      position: { yaw: -32, pitch: 15, width: 44 },
      slides: [
        { image: "popups/g2-fotomicrografia-01", start: 12.0, end: 21.5, note: "águas ricas em cálcio circularam pelo solo…" },
        { image: "popups/g2-fotomicrografia-02", start: 21.5, end: 31.5, note: "evaporação… crosta rica em carbonato de cálcio" },
        { image: "popups/g2-fotomicrografia-03", start: 31.5, end: 39.0, note: "rocha com cerca de 98% de carbonato, baixa sílica" },
        { image: "popups/g2-fotomicrografia-04", start: 39.0, note: "estética única… textura brechoide (imagem microscópica)" },
      ],
    },
  ],

  // ── Etapa 2 · Ponto 1 — Base da pedreira ────────────────────────────────────────────────
  "e2-p1": [
    {
      // "Fissuras, cavidades e heterogeneidades…" até antes de "No passado…".
      type: "single",
      id: "fissuras",
      image: "popups/e2-p1-fissuras",
      alt: "Fissuras: exemplos de fissuras e cavidades em blocos de Bege Bahia",
      start: 9.0,
      end: 19.8,
      position: { yaw: -32, pitch: 8, width: W },
    },
  ],

  // ── Etapa 2 · Ponto 2 — Corte do bloco ──────────────────────────────────────────────────
  "e2-p2": [
    {
      // "O fio diamantado trouxe mais precisão…": uma passada inteira da animação (9,04 s).
      type: "video",
      id: "fio-cortando-pedra",
      video: "popups/g2-fio-cortando-pedra",
      alt: "Animação: fio diamantado cortando um bloco de pedra",
      start: 0.3,
      end: 9.35,
      chromaKey: "#00ff00",
      // A animação ocupa x 25–79% do quadro 16:9 (medido em todos os quadros): enquadra essa área.
      crop: { x: 0.23, y: 0, w: 0.58, h: 1 },
      // No chão da pedreira, como um bloco sendo cortado (à esquerda do operador real).
      position: { yaw: -32, pitch: -11, width: 48 },
    },
    {
      // "…reduziu perdas, aumentou o aproveitamento dos blocos…" — mesmo lugar, após a animação.
      type: "single",
      id: "fio-helicoidal-x-diamantado",
      image: "popups/g2-fio-helicoidal-x-diamantado",
      alt: "Comparação: fio helicoidal e fio diamantado",
      start: 9.4,
      position: { yaw: -30, pitch: 12, width: W },
      pending: "Comparação visual entre fio helicoidal e fio diamantado (opcional no roteiro)",
    },
  ],

  // ── Etapa 3 — Serraria ──────────────────────────────────────────────────────────────────
  "e3-p3": [
    {
      // "…e a sustentabilidade também evoluiu" até o fim. (= Geologar 2/Popups/8_comparacao_agua.png)
      type: "single",
      id: "agua",
      image: "popups/e3-p3-agua",
      alt: "Consumo de água por bloco: tear tradicional 200.000 litros; tear moderno 13.000 litros",
      start: 15.8,
      // Ao lado do bloco, no vão entre ele (yaw ≈ 118°) e o tear multifio (yaw ≈ 148°).
      position: { yaw: 133, pitch: 6, width: 28 },
    },
  ],
  "e3-p4": [
    {
      type: "single",
      id: "politriz-manual",
      image: "popups/e3-p4-politriz-manual",
      alt: "Politrizes manuais: polimento e posicionamento de chapas feitos por um operador",
      start: 0, // polimento: pop-up desde o começo da cena (pedido do cliente)
      position: { yaw: -40, pitch: 14, width: W },
    },
  ],
  "e3-p5": [
    {
      type: "single",
      id: "politriz-semiauto",
      image: "popups/e3-p5-politriz-semiauto",
      alt: "Politrizes semiautomáticas: uma máquina realiza o polimento e o operador faz o posicionamento da chapa",
      start: 0, // polimento: pop-up desde o começo da cena (pedido do cliente)
      position: { yaw: -36, pitch: 12, width: W },
    },
  ],
  "e3-p6": [
    {
      // Desde o começo até antes de "Durante o corte… pó fino".
      type: "single",
      id: "politriz-automatica",
      image: "popups/e3-p6-politriz-automatica",
      alt: "Politrizes automáticas: todo o processo é realizado por uma máquina, reduzindo o desperdício de material",
      start: 0, // polimento: pop-up desde o começo da cena (pedido do cliente)
      end: 16.2,
      position: { yaw: -42, pitch: 16, width: W },
    },
    {
      // "Durante o corte… pó fino… polipropileno… mobiliário urbano, escolar e infraestrutura."
      type: "single",
      id: "composito",
      image: "popups/g2-composito-residuo",
      alt: "Aplicação de compósito produzido com resíduos do Bege Bahia",
      start: 16.4,
      position: { yaw: -42, pitch: 16, width: W },
      pending: "Aplicação de compósito produzido com resíduos do Bege Bahia",
    },
  ],

  // ── Etapa 4 — Reaproveitamento ──────────────────────────────────────────────────────────
  "e4-p1": [
    {
      type: "single",
      id: "produtos",
      image: "popups/e4-p1-produtos",
      alt: "Produtos do reaproveitamento: moledo, placas de porcelanato e ladrilho",
      start: 8.7,
      position: { yaw: -40, pitch: 12, width: W },
    },
  ],

  // ── Etapa 5 — Vista final ───────────────────────────────────────────────────────────────
  "e5-p1": [
    {
      // A narração não cita aplicações específicas: 4 slides de duração igual entre
      // "Do sertão baiano para o mundo" e antes de "Agora… observe ao seu redor" (vista livre).
      type: "sequence",
      id: "aplicacoes",
      alt: "Aplicações arquitetônicas do Bege Bahia",
      // Centralizado na vista inicial da cena (pedido do cliente).
      position: { yaw: 0, pitch: 14, width: W },
      slides: [
        { image: "popups/g2-aplicacao-01", start: 0.3, end: 7.2, note: "Moledo — revestimento externo (fachada)" },
        { image: "popups/g2-aplicacao-02", start: 7.2, end: 14.1, note: "Moledo — ambientes internos" },
        { image: "popups/g2-aplicacao-03", start: 14.1, end: 20.9, note: "Placas — piscina e área de lazer" },
        { image: "popups/g2-aplicacao-04", start: 20.9, end: 27.8, note: "Placas — área externa" },
      ],
    },
    {
      // Créditos logo depois das aplicações, até o fim da narração (43,49 s): 4 logos de ~3,9 s.
      // Cartões gerados por scripts/credits-from-video.py a partir do vídeo de encerramento antigo.
      type: "sequence",
      id: "creditos",
      alt: "Créditos: GeoLogar, Museu Geológico da Bahia, ExpoGeo Virtual e CNPq",
      position: { yaw: 0, pitch: 12, width: 30 },
      slides: [
        { image: "creditos/1-geologar", start: 27.8, end: 31.7, note: "GeoLogar" },
        { image: "creditos/2-mgb", start: 31.7, end: 35.6, note: "Museu Geológico da Bahia" },
        { image: "creditos/3-expogeo", start: 35.6, end: 39.5, note: "ExpoGeo Virtual" },
        { image: "creditos/4-cnpq", start: 39.5, note: "CNPq — até o fim da cena" },
      ],
    },
  ],
};

/** Converte as definições de uma cena em overlays + cues do motor (sistema existente). */
export function popupsFor(sceneId: string): Pick<TourScene, "overlays" | "cues"> {
  const defs = popupTimeline[sceneId] ?? [];
  const overlays: Overlay[] = [];
  const cues: Cue[] = [];
  for (const p of defs) {
    const anchor = { ...p.position };
    const show = (from: number, to?: number): Cue => ({
      id: `${p.id}@narracao`,
      timeline: "narration",
      from,
      ...(to !== undefined ? { to } : {}),
      action: { type: "showOverlay", overlayId: p.id },
    });
    if (p.type === "single") {
      overlays.push({ id: p.id, kind: "image", src: p.image, alt: p.alt, bare: true, anchor, ...(p.crop ? { crop: p.crop } : {}) });
      cues.push(show(p.start, p.end));
    } else if (p.type === "sequence") {
      overlays.push({
        id: p.id,
        kind: "image",
        alt: p.alt,
        bare: true,
        anchor,
        slides: p.slides.map((s) => ({ src: s.image, from: s.start, ...(s.end !== undefined ? { to: s.end } : {}) })),
      });
      const last = p.slides[p.slides.length - 1];
      cues.push(show(p.slides[0].start, last.end));
    } else {
      overlays.push({
        id: p.id,
        kind: "video",
        src: p.video,
        alt: p.alt,
        bare: true,
        anchor,
        videoStart: p.start,
        ...(p.chromaKey ? { chromaKey: p.chromaKey } : {}),
        ...(p.crop ? { crop: p.crop } : {}),
      });
      cues.push(show(p.start, p.end));
    }
  }
  return { overlays, cues };
}

/** Todos os ids de mídia referenciados pelos pop-ups (para validação). */
export function popupMediaIds(): { id: string; pending: boolean; scene: string }[] {
  const out: { id: string; pending: boolean; scene: string }[] = [];
  for (const [scene, defs] of Object.entries(popupTimeline))
    for (const p of defs) {
      const ids = p.type === "single" ? [p.image] : p.type === "video" ? [p.video] : p.slides.map((s) => s.image);
      for (const id of ids) out.push({ id, pending: !!p.pending, scene });
    }
  return out;
}
