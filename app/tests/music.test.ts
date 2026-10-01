import { describe, expect, it } from "vitest";
import { dbToGain, musicTarget } from "../src/media/musicRules";
import { tour } from "../src/tour/scenes";

describe("música de fundo (ducking)", () => {
  it("parada antes de iniciar e com o tour pausado", () => {
    expect(musicTarget({ phase: "idle", narration: "idle" })).toEqual({ playing: false, ducked: false });
    expect(musicTarget({ phase: "paused", narration: "paused" })).toEqual({ playing: false, ducked: false });
  });

  it("abaixa enquanto o narrador fala", () => {
    expect(musicTarget({ phase: "playing", narration: "playing" })).toEqual({ playing: true, ducked: true });
  });

  it("volta ao normal entre narrações, nas transições, após a narração (vídeo) e na conclusão", () => {
    for (const s of [
      { phase: "transitioning", narration: "loading" },
      { phase: "loading", narration: "loading" },
      { phase: "playing", narration: "ended" },
      { phase: "playing", narration: "waiting" },
      { phase: "finished", narration: "ended" },
      { phase: "error", narration: "error" },
    ] as const)
      expect(musicTarget(s), `${s.phase}/${s.narration}`).toEqual({ playing: true, ducked: false });
  });

  it("dB → ganho linear", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(20)).toBeCloseTo(10, 6);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it("configuração do roteiro: abaixada < normal e sem clipar (pico do arquivo −28 dBFS)", () => {
    const m = tour.music!;
    expect(m.duckedGainDb).toBeLessThan(m.gainDb);
    expect(-28 + m.gainDb).toBeLessThan(-6);
    expect(m.loopEnd).toBeLessThan(150);
  });
});
