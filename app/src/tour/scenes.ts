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
import { popupsFor } from "./popups";

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
    hotspots: [],
    ...popupsFor("intro"), // pop-ups: src/tour/popups.ts
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
    hotspots: [],
    ...popupsFor("e1-p1"), // pop-ups: src/tour/popups.ts
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
    hotspots: [],
    ...popupsFor("e1-p2"), // pop-ups: src/tour/popups.ts
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
    hotspots: [],
    ...popupsFor("e2-p1"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e2-p2",
    title: "Corte do bloco de Bege Bahia",
    stage: "Etapa 2 — Extração na Pedreira",
    // Vídeo 42,6 s × narração 14,7 s: aqui a cena AVANÇA quando a narração termina, sem esperar o
    // vídeo 360 acabar (decisão do cliente; resolve A2 — operador na frente da câmera aos ~40 s).
    media: video([clip("e2-p2", false)], { requireAllClipsOnce: false, finishCurrentClipAfterNarration: false }),
    narration: "audio/e2-p2",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p1",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e2-p2"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e3-p1",
    title: "Ponte rolante / transporte do bloco",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D1: os dois clips obrigatórios e inteiros, sem loop (30,2 s × narração 22 s). Ordem da ação:
    // 1-2 = bloco descendo do caminhão (5,9 s) → 1-1 = ponte rolante levando o bloco ao tear (24,3 s).
    media: video([clip("e3-p1-2"), clip("e3-p1-1")], { loopWhileNarrating: false }),
    narration: "audio/e3-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p2",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e3-p1"), // pop-ups: src/tour/popups.ts
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
    hotspots: [],
    ...popupsFor("e3-p2"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e3-p3",
    title: "Tear multifio",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 21,1 s × narração 31,4 s → loop.
    media: video([clip("e3-p3")]),
    narration: "audio/e3-p3",
    // De frente para o tear multifio (Delta Wire, yaw ≈ 175°), com o bloco à esquerda (yaw ≈ 90–118°).
    initialView: { ...DEFAULT_VIEW, yaw: 155 },
    next: "e3-p4",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e3-p3"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e3-p4",
    title: "Politriz manual",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 21,3 s × narração 27,6 s → loop.
    media: video([clip("e3-p4")]),
    narration: "audio/e3-p4",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p5",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e3-p4"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e3-p5",
    title: "Politriz semiautomática",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 11,0 s × narração 15,2 s → loop.
    media: video([clip("e3-p5")]),
    narration: "audio/e3-p5",
    initialView: { ...DEFAULT_VIEW },
    next: "e3-p6",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e3-p5"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e3-p6",
    title: "Politriz automática",
    stage: "Etapa 3 — Serraria e Tecnologia",
    // D2: vídeo 22,5 s × narração 43,6 s → loop. Vídeo sem áudio ambiente útil (silêncio).
    media: video([clip("e3-p6")]),
    narration: "audio/e3-p6",
    initialView: { ...DEFAULT_VIEW },
    next: "e4-p1",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e3-p6"), // pop-ups: src/tour/popups.ts
  },
  {
    id: "e4-p1",
    title: "Área de reaproveitamento / reciclagem",
    stage: "Etapa 4 — Inovação e Sustentabilidade",
    // Vídeo 27,7 s × narração 29,78 s: sobram ~2,1 s de narração no fim do vídeo — o último quadro fica
    // parado por esse tempo em vez de um ciclo inteiro extra de 27,7 s (A3).
    media: video([clip("e4-p1")], { loopMinNarrationRemaining: 3 }),
    narration: "audio/e4-p1",
    initialView: { ...DEFAULT_VIEW },
    next: "e5-p1",
    autoAdvance: true,
    hotspots: [],
    ...popupsFor("e4-p1"), // pop-ups: src/tour/popups.ts
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
    hotspots: [],
    ...popupsFor("e5-p1"), // pop-ups: src/tour/popups.ts
  },
];

export const tour: TourDefinition = {
  id: "geologar-bege-bahia",
  title: "Geologar — Bege Bahia",
  firstScene: "intro",
  scenes,
  credits: {
    // Roteiro: créditos e logos institucionais em pop-up reduzido (materiais pendentes — ver MISSING_POPUPS.md).
    overlays: [],
    displaySeconds: 8,
  },
  // Música de fundo da experiência original (Musica/GL_MusicaAmbiente_TheSims_VolumeBaixo.mp3).
  // O arquivo é muito baixo (−45 LUFS; narrações ≈ −11,5 LUFS), então o ganho é positivo:
  //   sem narração  +15 dB → ≈ −30 LUFS (presente, mas de fundo)
  //   com narração   +7 dB → ≈ −38 LUFS (~26 dB abaixo da voz, não disputa com o narrador)
  // Pico do arquivo −28 dBFS → +15 dB fica em −13 dBFS, sem clipar.
  // loopEnd: o arquivo termina com 1,4 s de silêncio (148,6 → 150 s); o loop volta antes dele.
  music: {
    src: "audio/musica-ambiente",
    gainDb: 15,
    duckedGainDb: 7,
    attackMs: 600,
    releaseMs: 1600,
    loopEnd: 148.6,
  },
};
