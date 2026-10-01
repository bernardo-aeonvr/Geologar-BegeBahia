/**
 * O ROTEIRO DO TOUR — fonte única da sequência.
 *
 * Fonte: Roteiro_Geologar_Bege_Bahia_Revisado.pdf (ver AUDITORIA_360.md, seções 5–6).
 * Para mudar ordem, panorama, narração, enquadramento, comportamento de vídeo, pop-ups ou
 * hotspots, edite SOMENTE este arquivo. Os ids de mídia são lógicos e resolvidos pelo
 * MediaResolver a partir de `public/media/manifest.json` (gerado por `npm run media`).
 *
 * initialView: por enquanto yaw/pitch 0. Referência para ajustar: capturas do 3DVista nas
 * páginas 5–12 do PDF do roteiro.
 */
import type { TourDefinition, TourScene, VideoClip, VideoSceneMedia } from "../types/tour";

const DEFAULT_VIEW = { yaw: 0, pitch: 0, fov: 75 };
const AMBIENT = 0.15;

/** Vídeo padrão do roteiro (D1/D2): clips inteiros, loop enquanto a narração toca, termina o ciclo atual. */
function video(clips: VideoClip[], overrides: Partial<VideoSceneMedia> = {}): VideoSceneMedia {
  return {
    type: "video",
    clips,
    requireAllClipsOnce: true,
    loopWhileNarrating: true,
    finishCurrentClipAfterNarration: true,
    ambientVolume: AMBIENT,
    ...overrides,
  };
}

const clip = (id: string, required = true): VideoClip => ({ id, src: `video/${id}`, required });

const empty = { cues: [], hotspots: [], overlays: [] } as const satisfies Pick<TourScene, "cues" | "hotspots" | "overlays">;

/**
 * Pop-up da experiência original (PNG já com o cartão desenhado), sincronizado à NARRAÇÃO:
 * aparece em `from` s e some em `to` s (omitido = fica até o fim da cena, inclusive nos loops).
 * Tempos medidos por transcrição com timestamps de palavra das narrações (2026-10-01).
 */
function narrationPopup(id: string, alt: string, from: number, to?: number): Pick<TourScene, "cues" | "hotspots" | "overlays"> {
  return {
    hotspots: [],
    overlays: [{ id, kind: "image", src: `popups/${id}`, alt, placement: "corner", bare: true }],
    cues: [{ id: `${id}@narracao`, timeline: "narration", from, ...(to !== undefined ? { to } : {}), action: { type: "showOverlay", overlayId: id } }],
  };
}

export const scenes: TourScene[] = [
  {
    id: "intro",
    title: "Introdução",
    stage: "Introdução — Lapier",
    media: { type: "image", src: "panoramas/e0-intro" },
    narration: "audio/e0-intro",
    initialView: { ...DEFAULT_VIEW },
    next: "e1-p1",
    autoAdvance: true,
    // Roteiro: imagem complementar "Distância Salvador → Ourolândia" (material pendente — D5).
    ...empty,
  },
  {
    id: "e1-p1",
    title: "Estrada",
    stage: "Etapa 1 — Ourolândia: Onde Tudo Começa",
    media: { type: "image", src: "panoramas/e1-p1" },
    narration: "audio/e1-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e1-p2",
    autoAdvance: true,
    // Roteiro: pop-up Travertino Romano × Bege Bahia durante a comparação (material pendente — D5).
    ...empty,
  },
  {
    id: "e1-p2",
    title: "Parte de cima da pedreira",
    stage: "Etapa 1 — Ourolândia: Onde Tudo Começa",
    media: { type: "image", src: "panoramas/e1-p2" },
    narration: "audio/e1-p2",
    initialView: { ...DEFAULT_VIEW },
    next: "e2-p1",
    autoAdvance: true,
    // Roteiro: comparação Calcrete × Bege Bahia; imagem microscópica opcional (pendente — D5).
    ...empty,
  },
  {
    id: "e2-p1",
    title: "Parte de baixo da pedreira",
    stage: "Etapa 2 — Extração na Pedreira",
    media: { type: "image", src: "panoramas/e2-p1" },
    narration: "audio/e2-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e2-p2",
    autoAdvance: true,
    // "Fissuras, cavidades e heterogeneidades…" (9,0 s) até antes de "No passado…" (20,1 s).
    ...narrationPopup("e2-p1-fissuras", "Fissuras: exemplos de fissuras e cavidades em blocos de Bege Bahia", 9.0, 19.8),
  },
  {
    id: "e2-p2",
    title: "Corte do bloco de Bege Bahia",
    stage: "Etapa 2 — Extração na Pedreira",
    // Vídeo 42,6 s × narração 14,7 s → vídeo continua até o fim (ver A2 na auditoria).
    media: video([clip("e2-p2")]),
    narration: "audio/e2-p2",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p1",
    autoAdvance: true,
    // Roteiro: manter animação do corte do bloco; comparação fio helicoidal × diamantado (pendente — D5).
    ...empty,
  },
  {
    id: "e3-p1",
    title: "Ponte rolante / transporte do bloco",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D1: 1-1 → 1-2, ambos obrigatórios e inteiros (34 s × narração 22 s). Sem loop.
    media: video([clip("e3-p1-1"), clip("e3-p1-2")], { loopWhileNarrating: false }),
    narration: "audio/e3-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p2",
    autoAdvance: true,
    ...empty,
  },
  {
    id: "e3-p2",
    title: "Tear tradicional",
    stage: "Etapa 3 — Serraria e Tecnologia",
    media: video([clip("e3-p2")]),
    narration: "audio/e3-p2",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p3",
    autoAdvance: true,
    ...empty,
  },
  {
    id: "e3-p3",
    title: "Tear multifio",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 23,0 s × narração 31,4 s → loop.
    media: video([clip("e3-p3")]),
    narration: "audio/e3-p3",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p4",
    autoAdvance: true,
    // Roteiro: manter a comparação de consumo de água. "…e a sustentabilidade também evoluiu" (15,8 s) até o fim.
    ...narrationPopup("e3-p3-agua", "Consumo de água por bloco: tear tradicional 200.000 litros; tear moderno 13.000 litros", 15.8),
  },
  {
    id: "e3-p4",
    title: "Politriz manual",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 23,2 s × narração 27,6 s → loop.
    media: video([clip("e3-p4")]),
    narration: "audio/e3-p4",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p5",
    autoAdvance: true,
    // "A primeira é totalmente manual…" (19,5 s) até o fim.
    ...narrationPopup("e3-p4-politriz-manual", "Politrizes manuais: polimento e posicionamento de chapas feitos por um operador", 19.5),
  },
  {
    id: "e3-p5",
    title: "Politriz semiautomática",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 12,8 s × narração 15,2 s → loop.
    media: video([clip("e3-p5")]),
    narration: "audio/e3-p5",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p6",
    autoAdvance: true,
    // "…o processo é semiautomático" (1,8 s) até o fim.
    ...narrationPopup("e3-p5-politriz-semiauto", "Politrizes semiautomáticas: uma máquina realiza o polimento e o operador faz o posicionamento da chapa", 1.8),
  },
  {
    id: "e3-p6",
    title: "Politriz automática",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 24,4 s × narração 43,6 s → loop. Vídeo sem áudio ambiente útil (silêncio).
    media: video([clip("e3-p6")]),
    narration: "audio/e3-p6",
    initialView: { ...DEFAULT_VIEW },
    next: "e4-p1",
    autoAdvance: true,
    // "…totalmente automatizado" (1,2 s) até antes de "Durante o corte… pó fino" (16,4 s).
    // Roteiro: aplicação de compósito, depois disso (material pendente — D5).
    ...narrationPopup("e3-p6-politriz-automatica", "Politrizes automáticas: todo o processo é realizado por uma máquina, reduzindo o desperdício de material", 1.2, 16.2),
  },
  {
    id: "e4-p1",
    title: "Área de reaproveitamento / reciclagem",
    stage: "Etapa 4 — Inovação e Sustentabilidade",
    // Vídeo 29,6 s × narração 29,78 s → `loopMinNarrationRemaining` evita um ciclo inteiro extra (A3).
    media: video([clip("e4-p1")]),
    narration: "audio/e4-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e5-p1",
    autoAdvance: true,
    // "…pode resultar em ladrilhos, placas… e moledos" (8,7 s) até o fim. "Outros produtos": pendente (D5).
    ...narrationPopup("e4-p1-produtos", "Produtos do reaproveitamento: moledo, placas de porcelanato e ladrilho", 8.7),
  },
  {
    id: "e5-p1",
    title: "Vista panorâmica final",
    stage: "Etapa 5 — Impacto e Finalização",
    media: { type: "image", src: "panoramas/e5-p1" },
    narration: "audio/e5-p1",
    initialView: { ...DEFAULT_VIEW },
    next: null,
    autoAdvance: true,
    onEnd: "credits",
    // Roteiro: aplicações arquitetônicas em pequenos pop-ups durante a narração (pendente — D5).
    ...empty,
  },
];

export const tour: TourDefinition = {
  id: "geologar-bege-bahia",
  title: "Geologar — Bege Bahia",
  firstScene: "intro",
  scenes,
  credits: {
    // Roteiro: créditos e logos institucionais em pop-up reduzido (materiais pendentes — D5).
    overlays: [],
    displaySeconds: 8,
  },
};
