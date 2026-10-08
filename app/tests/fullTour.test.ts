/**
 * Primeiro marco: as 13 cenas do roteiro real rodando sozinhas do início ao fim, respeitando
 * narração, vídeos inteiros, loops e sequência de clips — sem intervenção do usuário.
 *
 * Simulação por eventos discretos com as durações REAIS medidas por ffprobe (AUDITORIA §2–3).
 * O simulador só dispara eventos `ended` na ordem em que aconteceriam; quem decide tudo é o motor.
 */
import { describe, expect, it } from "vitest";
import { tour } from "../src/tour/scenes";
import { isVideo } from "../src/tour/sceneRules";
import { createHarness, flush } from "./fakes";

const NARRATION: Record<string, number> = {
  "audio/e0-intro": 39.967, "audio/e1-p1": 45.714, "audio/e1-p2": 44.565, "audio/e2-p1": 31.451,
  "audio/e2-p2": 14.681, "audio/e3-p1": 22.152, "audio/e3-p2": 16.98, "audio/e3-p3": 31.399,
  "audio/e3-p4": 27.559, "audio/e3-p5": 15.229, "audio/e3-p6": 43.572, "audio/e4-p1": 29.78,
  "audio/e5-p1": 43.494,
};
const VIDEO: Record<string, number> = {
  // Variantes geradas, já sem o fade para preto embutido no fim (outPoint em media-sources.json).
  "media/video/e2-p2.mp4": 42.6, "media/video/e3-p1-1.mp4": 24.28, "media/video/e3-p1-2.mp4": 5.96,
  "media/video/e3-p2.mp4": 18.12, "media/video/e3-p3.mp4": 21.16, "media/video/e3-p4.mp4": 21.32,
  "media/video/e3-p5.mp4": 11.0, "media/video/e3-p6.mp4": 22.56, "media/video/e4-p1.mp4": 27.76,
};

interface SceneLog {
  id: string;
  seconds: number;
  clips: string[];
  cycles: number;
}

async function runWholeTour() {
  const h = createHarness(tour, { loopMinNarrationRemaining: 1 });
  const logs: SceneLog[] = [];
  await h.engine.start();
  await flush();

  let guard = 0;
  while (h.store.get().phase === "playing" && guard++ < 200) {
    const sceneId = h.store.get().sceneId!;
    const scene = tour.scenes.find((s) => s.id === sceneId)!;
    const log: SceneLog = { id: sceneId, seconds: 0, clips: [], cycles: 0 };
    logs.push(log);

    let narrationLeft = NARRATION[scene.narration!];
    h.narration.duration = narrationLeft;
    h.narration.currentTime = 0;
    let narrationPlaying = true;
    let clipLeft = isVideo(scene) ? VIDEO[h.video.active!.url] : Infinity;
    if (isVideo(scene)) log.clips.push(h.video.active!.url.replace("media/video/", "").replace(".mp4", ""));

    while (h.store.get().sceneId === sceneId && h.store.get().phase === "playing") {
      const holding = h.store.get().video?.holding;
      const videoRunning = isVideo(scene) && !holding && h.video.playing;
      const nextNarr = narrationPlaying ? narrationLeft : Infinity;
      const nextClip = videoRunning ? clipLeft : Infinity;
      if (nextNarr === Infinity && nextClip === Infinity) throw new Error(`cena ${sceneId} travou sem eventos pendentes`);

      if (nextNarr <= nextClip) {
        log.seconds += nextNarr;
        clipLeft -= nextNarr;
        narrationLeft = 0;
        h.narration.currentTime = h.narration.duration;
        narrationPlaying = false;
        h.narration.end();
      } else {
        log.seconds += nextClip;
        narrationLeft -= nextClip;
        h.narration.currentTime = h.narration.duration - narrationLeft;
        const before = h.video.loads.length;
        h.video.endClip();
        await flush();
        if (h.store.get().sceneId === sceneId && h.video.loads.length > before) {
          const url = h.video.active!.url;
          clipLeft = VIDEO[url];
          log.clips.push(url.replace("media/video/", "").replace(".mp4", ""));
          log.cycles = h.store.get().video!.videoCycle;
        }
        continue;
      }
      await flush();
    }
  }
  return { h, logs };
}

describe("Tour completo (13 cenas, automático)", () => {
  it("executa as 13 cenas na ordem do roteiro e termina na tela de conclusão", async () => {
    const { h, logs } = await runWholeTour();
    expect(logs.map((l) => l.id)).toEqual([
      "intro", "e1-p1", "e1-p2", "e2-p1", "e2-p2", "e3-p1", "e3-p2", "e3-p3", "e3-p4", "e3-p5", "e3-p6", "e4-p1", "e5-p1",
    ]);
    expect(h.store.get().phase).toBe("finished"); // créditos sem material ainda → conclusão direta
    expect(h.store.get().sceneId).toBe("e5-p1"); // não reiniciou sozinho

    const byId = Object.fromEntries(logs.map((l) => [l.id, l]));
    const r = (n: number) => Math.round(n * 100) / 100;

    // Imagem: dura exatamente a narração.
    expect(r(byId["intro"].seconds)).toBe(39.97);
    // e2-p2: configurada para avançar no fim da narração (14,68 s), sem esperar o vídeo de 42,6 s.
    expect(r(byId["e2-p2"].seconds)).toBe(14.68);
    // Caso C (D1): 1-2 (caminhão) + 1-1 (ponte rolante → tear) inteiros, nessa ordem, apesar da narração de 22 s.
    expect(byId["e3-p1"].clips).toEqual(["e3-p1-2", "e3-p1-1"]);
    expect(r(byId["e3-p1"].seconds)).toBe(30.24);
    // Caso A (D2): loops até a narração acabar + término do ciclo atual.
    expect(byId["e3-p3"]).toMatchObject({ cycles: 1 });
    expect(r(byId["e3-p3"].seconds)).toBe(42.32); // 2 × 21,16
    expect(r(byId["e3-p4"].seconds)).toBe(42.64); // 2 × 21,32
    expect(r(byId["e3-p5"].seconds)).toBe(22); // 2 × 11,0
    expect(r(byId["e3-p6"].seconds)).toBe(45.12); // 2 × 22,56
    // A3: faltam ~2 s de narração (< loopMinNarrationRemaining 3 da cena) → segura o último quadro; termina com a narração.
    expect(byId["e4-p1"].cycles).toBe(0);
    expect(r(byId["e4-p1"].seconds)).toBe(29.78);

    // Duração total do tour (sem os fades): ~7 min 30 s.
    const total = logs.reduce((a, l) => a + l.seconds, 0);
    expect(total).toBeCloseTo(450.09, 1);
  });
});
