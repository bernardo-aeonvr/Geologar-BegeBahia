/**
 * Pop-ups: configuração central (popups.ts) × roteiro × manifest, e a lógica determinística das
 * sequências (fotomicrografias e aplicações) pelo tempo da narração.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateOverlays, slideIndexAt } from "../src/tour/sceneRules";
import { popupMediaIds, popupTimeline, popupsFor, type SequencePopup } from "../src/tour/popups";
import { tour } from "../src/tour/scenes";
import type { TourDefinition, TourScene } from "../src/types/tour";
import { createHarness, flush } from "./fakes";

const manifestPath = join(__dirname, "..", "public", "media", "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { assets: {} };
const narrationDuration = (sceneId: string) => {
  const s = tour.scenes.find((x) => x.id === sceneId)!;
  return manifest.assets[s.narration!]?.variants?.web?.duration as number;
};
const seq = (scene: string, id: string) => popupTimeline[scene].find((p) => p.id === id) as SequencePopup;

describe("configuração dos pop-ups", () => {
  it("toda cena referenciada existe no roteiro", () => {
    for (const id of Object.keys(popupTimeline)) expect(tour.scenes.some((s) => s.id === id), id).toBe(true);
  });

  it("assets entregues existem no manifest; só os marcados `pending` podem faltar", () => {
    for (const m of popupMediaIds()) {
      const present = !!manifest.assets[m.id];
      if (!m.pending) expect(present, `${m.scene}: ${m.id} sem arquivo — rode npm run media`).toBe(true);
      else expect(present, `${m.scene}: ${m.id} já existe — remova "pending" em popups.ts`).toBe(false);
    }
  });

  it("tempos dentro da narração e slides contíguos, em ordem, sem sobreposição", () => {
    for (const [scene, defs] of Object.entries(popupTimeline)) {
      const dur = narrationDuration(scene);
      for (const p of defs) {
        const ranges =
          p.type === "sequence" ? p.slides.map((s) => [s.start, s.end ?? dur]) : [[p.start, p.end ?? dur]];
        for (const [a, b] of ranges) {
          expect(a, `${scene}/${p.id}`).toBeGreaterThanOrEqual(0);
          expect(b, `${scene}/${p.id}`).toBeGreaterThan(a);
          expect(a, `${scene}/${p.id} começa depois do fim da narração`).toBeLessThan(dur);
        }
        if (p.type === "sequence")
          for (let i = 1; i < p.slides.length; i++) expect(p.slides[i].start, `${p.id} slide ${i + 1}`).toBe(p.slides[i - 1].end);
      }
    }
  });

  it("dois pop-ups no mesmo lugar da cena nunca ficam ativos ao mesmo tempo", () => {
    for (const [scene, defs] of Object.entries(popupTimeline)) {
      const dur = narrationDuration(scene);
      const span = (p: (typeof defs)[number]) =>
        p.type === "sequence" ? [p.slides[0].start, p.slides.at(-1)!.end ?? dur] : [p.start, p.end ?? dur];
      for (let i = 0; i < defs.length; i++)
        for (let j = i + 1; j < defs.length; j++) {
          const a = defs[i], b = defs[j];
          const close = Math.abs(a.position.yaw - b.position.yaw) < (a.position.width + b.position.width) / 2;
          if (!close) continue;
          const [a0, a1] = span(a), [b0, b1] = span(b);
          expect(a1 <= b0 || b1 <= a0, `${scene}: ${a.id} × ${b.id} se sobrepõem`).toBe(true);
        }
    }
  });

  it("popupsFor gera um overlay ancorado e um cue de narração por pop-up", () => {
    const { overlays, cues } = popupsFor("e1-p2");
    expect(overlays.map((o) => o.id)).toEqual(["calcrete-x-bege", "fotomicrografias"]);
    expect(overlays.every((o) => o.anchor && o.bare)).toBe(true);
    expect(cues.every((c) => c.timeline === "narration")).toBe(true);
    expect(overlays[1].slides).toHaveLength(4);
  });
});

/** Ponto no meio de cada intervalo + bordas: start, 25%, 50%, 75%, fim. */
function checkpoints(p: SequencePopup, dur: number) {
  const a = p.slides[0].start, b = p.slides.at(-1)!.end ?? dur;
  return [0, 0.25, 0.5, 0.75, 1].map((f) => (f === 1 ? b - 0.01 : a + (b - a) * f));
}

function expectedSlide(p: SequencePopup, t: number, dur: number) {
  return p.slides.findIndex((s) => t >= s.start && t < (s.end ?? dur));
}

describe.each([
  ["e1-p2", "fotomicrografias"],
  ["e5-p1", "aplicacoes"],
])("sequência %s/%s (seek determinístico)", (scene, id) => {
  const p = seq(scene, id);
  const dur = narrationDuration(scene);
  const ov = popupsFor(scene).overlays.find((o) => o.id === id)!;

  it("início, 25%, 50%, 75% e final mostram o slide do intervalo", () => {
    const pts = checkpoints(p, dur);
    const shown = pts.map((t) => slideIndexAt(ov.slides!, t));
    expect(shown).toEqual(pts.map((t) => expectedSlide(p, t, dur)));
    expect(shown[0]).toBe(0);
    expect(shown[4]).toBe(p.slides.length - 1);
  });

  it("seek para frente/trás e pausa: o slide depende só do tempo", () => {
    const { cues, overlays } = popupsFor(scene);
    const at = (t: number) => evaluateOverlays(cues, overlays, { narration: t, clip: null, clipIndex: null }).slides[id];
    const mid = p.slides.map((s) => (s.start + (s.end ?? dur)) / 2);
    expect(mid.map(at)).toEqual(p.slides.map((_, i) => i)); // avançando
    expect([...mid].reverse().map(at)).toEqual(p.slides.map((_, i) => i).reverse()); // voltando
    expect(at(mid[1])).toBe(at(mid[1])); // pausado no mesmo instante = mesmo slide
  });

  it("fora da janela da sequência nada é exibido", () => {
    const { cues, overlays } = popupsFor(scene);
    const before = evaluateOverlays(cues, overlays, { narration: p.slides[0].start - 0.05, clip: null, clipIndex: null });
    expect(before.active).not.toContain(id);
    const end = p.slides.at(-1)!.end;
    if (end !== undefined) {
      const after = evaluateOverlays(cues, overlays, { narration: end + 0.05, clip: null, clipIndex: null });
      expect(after.active).not.toContain(id);
    }
  });
});

describe("motor: relógio dos pop-ups segue a narração", () => {
  const scene = (id: string, next: string | null): TourScene => ({
    id,
    title: id,
    stage: "t",
    media: { type: "image", src: `panoramas/${id}` },
    narration: `audio/${id}`,
    initialView: { yaw: 0, pitch: 0, fov: 75 },
    next,
    autoAdvance: true,
    hotspots: [],
    overlays: [
      {
        id: "seq",
        kind: "image",
        anchor: { yaw: 0, pitch: 0, width: 40 },
        slides: [
          { src: "a", from: 2, to: 5 },
          { src: "b", from: 5, to: 8 },
          { src: "c", from: 8 },
        ],
      },
    ],
    cues: [{ id: "seq@n", timeline: "narration", from: 2, action: { type: "showOverlay", overlayId: "seq" } }],
  });
  const t: TourDefinition = { id: "t", title: "t", firstScene: "s1", scenes: [scene("s1", "s2"), scene("s2", null)], credits: { overlays: [], displaySeconds: 1 } };

  it("seek, volta, pausa, reinício da narração e troca de ponto", async () => {
    const h = createHarness(t);
    await h.engine.start();
    await flush();
    const at = (time: number) => {
      h.narration.currentTime = time;
      h.tick();
      return h.store.get().overlaySlides.seq ?? -1;
    };
    expect(at(1)).toBe(-1); // antes da sequência
    expect(h.store.get().activeOverlays).toEqual([]);
    expect(at(6.5)).toBe(1); // seek direto para o meio
    expect(at(3)).toBe(0); // voltou no áudio
    h.engine.pause();
    expect(at(3)).toBe(0); // pausado mantém
    await h.engine.resume();
    expect(at(9)).toBe(2);
    expect(at(0)).toBe(-1); // narração reiniciada → sequência reinicia
    expect(at(2.1)).toBe(0);

    await h.engine.next(); // troca de ponto cancela o pop-up anterior
    await flush();
    expect(h.store.get().sceneId).toBe("s2");
    expect(h.store.get().activeOverlays).toEqual([]);
    expect(h.store.get().overlaySlides).toEqual({});
  });
});
