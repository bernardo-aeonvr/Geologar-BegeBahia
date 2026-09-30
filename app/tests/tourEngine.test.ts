/**
 * Testes obrigatórios do motor (AUDITORIA_360.md §11).
 */
import { describe, expect, it } from "vitest";
import type { TourDefinition, TourScene, VideoSceneMedia } from "../src/types/tour";
import { createHarness, flush } from "./fakes";

const base = { initialView: { yaw: 0, pitch: 0, fov: 75 }, autoAdvance: true, cues: [], hotspots: [], overlays: [] };

function img(id: string, next: string | null, extra: Partial<TourScene> = {}): TourScene {
  return { id, title: id, stage: "t", media: { type: "image", src: `panoramas/${id}` }, narration: `audio/${id}`, next, ...base, ...extra };
}

function vid(id: string, clips: string[], next: string | null, media: Partial<VideoSceneMedia> = {}): TourScene {
  return {
    id,
    title: id,
    stage: "t",
    media: {
      type: "video",
      clips: clips.map((c) => ({ id: c, src: `video/${c}`, required: true })),
      requireAllClipsOnce: true,
      loopWhileNarrating: true,
      finishCurrentClipAfterNarration: true,
      ambientVolume: 0.15,
      ...media,
    },
    narration: `audio/${id}`,
    next,
    ...base,
  };
}

function tourOf(scenes: TourScene[], credits = false): TourDefinition {
  const last = scenes[scenes.length - 1];
  last.onEnd = "credits";
  return {
    id: "t",
    title: "t",
    firstScene: scenes[0].id,
    scenes,
    credits: { overlays: credits ? [{ id: "logos", kind: "text", compact: true }] : [], displaySeconds: 5 },
  };
}

describe("TourEngine", () => {
  it("1. imagem + narração: narração termina → avança", async () => {
    const h = createHarness(tourOf([img("a", "b"), img("b", null)]));
    await h.engine.start();
    await flush();
    expect(h.store.get().sceneId).toBe("a");
    expect(h.store.get().phase).toBe("playing");
    expect(h.narration.url).toBe("blob:audio/a");
    expect(h.narration.state).toBe("playing");

    h.narration.end();
    await flush();
    expect(h.store.get().sceneId).toBe("b");
    expect(h.narration.url).toBe("blob:audio/b");
    expect(h.viewer.fades).toEqual([1, 0, 1]); // fade-in inicial, fade-out, fade-in
  });

  it("2. vídeo maior que a narração: narração termina → vídeo continua → vídeo termina → avança", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], "next"), img("next", null)]));
    await h.engine.start();
    await flush();
    expect(h.video.playing).toBe(true);

    h.narration.end();
    await flush();
    expect(h.store.get().sceneId).toBe("v"); // não cortou o vídeo
    expect(h.store.get().exitRequested).toBe(true);
    expect(h.video.playing).toBe(true);

    h.video.endClip();
    await flush();
    expect(h.store.get().sceneId).toBe("next");
  });

  it("3. vídeo menor que a narração: vídeo termina → loop → narração termina → termina o ciclo atual → avança", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], "next"), img("next", null)]));
    await h.engine.start();
    await flush();
    h.narration.duration = 44;
    h.narration.currentTime = 24; // restam 20 s de narração quando o vídeo (24 s) acaba

    h.video.endClip();
    await flush();
    expect(h.store.get().sceneId).toBe("v");
    expect(h.store.get().video?.videoCycle).toBe(1);
    expect(h.video.loads.map((l) => l.index)).toEqual([0, 0]); // recomeçou o clip 0
    expect(h.video.playing).toBe(true);

    h.narration.end(); // no meio do segundo ciclo
    await flush();
    expect(h.store.get().sceneId).toBe("v"); // não corta o loop no meio
    expect(h.video.playing).toBe(true);

    h.video.endClip(); // fim natural do ciclo atual
    await flush();
    expect(h.store.get().sceneId).toBe("next");
  });

  it("3b. loop por fração de segundo é evitado (loopMinNarrationRemaining)", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], "next"), img("next", null)]));
    await h.engine.start();
    await flush();
    h.narration.duration = 29.78;
    h.narration.currentTime = 29.6;

    h.video.endClip();
    await flush();
    expect(h.store.get().video?.holding).toBe(true); // não iniciou um ciclo inteiro por 0,18 s
    expect(h.video.loads).toHaveLength(1);

    h.narration.end();
    await flush();
    expect(h.store.get().sceneId).toBe("next");
  });

  it("4. dois vídeos obrigatórios: 1-1 → narração termina → termina 1-1 → 1-2 inteiro → avança", async () => {
    const h = createHarness(
      tourOf([vid("e3", ["c1", "c2"], "next", { loopWhileNarrating: false }), img("next", null)]),
    );
    await h.engine.start();
    await flush();
    expect(h.video.active?.index).toBe(0);
    expect(h.video.prepared).toContain("media/video/c2.mp4"); // pré-carrega 1-2 enquanto 1-1 toca
    expect(h.video.prepared).not.toContain("media/panoramas/next.mp4");
    expect(h.preloader.panoramas).not.toContain("panoramas/next"); // próxima cena só depois

    h.narration.end(); // narração (22 s) acaba durante 1-1 (26 s)
    await flush();
    expect(h.store.get().sceneId).toBe("e3");

    h.video.endClip(); // fim de 1-1
    await flush();
    expect(h.store.get().sceneId).toBe("e3");
    expect(h.video.active?.index).toBe(1);
    expect(h.video.loads[1]).toMatchObject({ index: 1, crossfade: true });
    expect(h.preloader.panoramas).toContain("panoramas/next"); // 1-2 começou → pré-carrega a próxima cena

    h.video.endClip(); // fim de 1-2
    await flush();
    expect(h.store.get().sceneId).toBe("next");
    expect(h.store.get().video).toBeNull();
  });

  it("3c. `ended` duplicado do mesmo clip não gera ciclo extra", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], "next"), img("next", null)]));
    await h.engine.start();
    await flush();
    h.narration.duration = 44;
    h.narration.currentTime = 10;
    const first = h.video.active!.handlers;
    first.onClipEnded(0);
    first.onClipEnded(0); // duplicado
    await flush();
    expect(h.store.get().video?.videoCycle).toBe(1);
    expect(h.video.loads).toHaveLength(2);
  });

  it("5. pause: narração e vídeo pausam juntos; resume retoma os dois", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], null)]));
    await h.engine.start();
    await flush();
    h.engine.pause();
    expect(h.store.get().phase).toBe("paused");
    expect(h.narration.state).toBe("paused");
    expect(h.video.playing).toBe(false);

    await h.engine.resume();
    expect(h.store.get().phase).toBe("playing");
    expect(h.narration.state).toBe("playing");
    expect(h.video.playing).toBe(true);
  });

  it("6. avanço manual: não espera o vídeo, cancela a cena e entra na próxima", async () => {
    const h = createHarness(tourOf([vid("v", ["v1", "v2"], "next", { loopWhileNarrating: false }), img("next", null)]));
    await h.engine.start();
    await flush();
    expect(h.video.playing).toBe(true);

    await h.engine.next();
    await flush();
    expect(h.store.get().sceneId).toBe("next");
    expect(h.video.stops.length).toBeGreaterThan(1); // vídeo parado
    expect(h.narration.url).toBe("blob:audio/next");
  });

  it("7. callback antigo: evento atrasado da cena anterior é ignorado (sceneToken)", async () => {
    const h = createHarness(tourOf([img("c1", "c2"), img("c2", "c3"), img("c3", null)]));
    await h.engine.start();
    await flush();
    const oldNarration = h.narration.history[0].handlers;

    await h.engine.next(); // usuário avança manualmente para c2
    await flush();
    expect(h.store.get().sceneId).toBe("c2");

    oldNarration.onEnded(); // 'ended' atrasado da cena 1
    await flush();
    expect(h.store.get().sceneId).toBe("c2"); // NÃO pulou para c3
    expect(h.logs.some((l) => l.event === "event:stale-ignored")).toBe(true);
  });

  it("7b. clip ended atrasado da cena anterior também é ignorado", async () => {
    const h = createHarness(tourOf([vid("v", ["v1"], "b"), img("b", "c"), img("c", null)]));
    await h.engine.start();
    await flush();
    const oldVideo = h.video.history[0].handlers;
    await h.engine.next(); // usuário sai da cena de vídeo para "b"
    await flush();
    expect(h.store.get().sceneId).toBe("b");
    oldVideo.onClipEnded(0); // 'ended' atrasado do vídeo da cena anterior
    await flush();
    expect(h.store.get().sceneId).toBe("b"); // não pulou para "c"
  });

  it("8. recomeçar: última cena → conclusão → recomeçar → primeira cena limpa", async () => {
    const h = createHarness(tourOf([img("a", "b"), img("b", null)], true));
    await h.engine.start();
    await flush();
    h.narration.end();
    await flush();
    h.narration.end(); // fim da última cena
    await flush();
    expect(h.store.get().phase).toBe("credits");
    expect(h.store.get().activeOverlays).toEqual(["logos"]);
    h.scheduled.at(-1)!.fn(); // fim do tempo dos créditos
    expect(h.store.get().phase).toBe("finished");

    h.engine.toggleMute();
    await h.engine.restart();
    await flush();
    const s = h.store.get();
    expect(s.sceneId).toBe("a");
    expect(s.phase).toBe("playing");
    expect(s.error).toBeNull();
    expect(s.activeOverlays).toEqual([]);
    expect(s.muted).toBe(true); // preferência do usuário preservada
    expect(h.preloader.cleared).toBe(1);
    expect(h.narration.url).toBe("blob:audio/a");
  });

  it("não reinicia sozinho na última cena e não navega para cena inexistente", async () => {
    const t = tourOf([img("a", "nao-existe")]);
    const h = createHarness(t);
    await h.engine.start();
    await flush();
    h.narration.end();
    await flush();
    expect(h.store.get().phase).toBe("finished");
    expect(h.store.get().sceneId).toBe("a");
  });

  it("transições não se sobrepõem: pedido manual durante transição aplica só o último destino", async () => {
    const h = createHarness(tourOf([img("a", "b"), img("b", "c"), img("c", "d"), img("d", null)]));
    // viewer lento: fade só resolve quando liberado
    let release: () => void = () => {};
    h.viewer.fadeTo = (level: 0 | 1) => {
      h.viewer.fades.push(level);
      return level === 0 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    };
    await h.engine.start();
    await flush();
    const going = h.engine.goToScene("b");
    await flush(2);
    void h.engine.goToScene("c"); // durante a transição
    void h.engine.goToScene("d"); // último pedido vence
    h.narration.end(); // evento automático durante a transição: ignorado
    release();
    await going;
    await flush();
    release();
    await flush();
    expect(h.store.get().sceneId).toBe("d");
  });

  it("falha de panorama mostra erro e permite tentar de novo", async () => {
    const h = createHarness(tourOf([img("a", null)]));
    h.preloader.failPanorama.add("panoramas/a");
    await h.engine.start();
    await flush();
    expect(h.store.get().phase).toBe("error");
    expect(h.store.get().error?.kind).toBe("panorama");
    h.preloader.failPanorama.clear();
    await h.engine.retry();
    await flush();
    expect(h.store.get().phase).toBe("playing");
  });

  it("narração bloqueada pelo navegador → erro 'autoplay' → gesto retoma", async () => {
    const h = createHarness(tourOf([img("a", null)]));
    h.narration.rejectNext = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    await h.engine.start();
    await flush();
    expect(h.store.get().error?.kind).toBe("autoplay");
    await h.engine.unblockAutoplay();
    expect(h.narration.state).toBe("playing");
    expect(h.store.get().phase).toBe("playing");
  });

  it("falha da narração não prende a cena: continuar sem narração segue a regra de término", async () => {
    const h = createHarness(tourOf([img("a", "b"), img("b", null)]));
    await h.engine.start();
    await flush();
    h.narration.handlers!.onError(new Error("decode"));
    await flush();
    expect(h.store.get().error?.kind).toBe("narration");
    h.engine.continueWithoutNarration();
    await flush();
    expect(h.store.get().sceneId).toBe("b");
  });

  it("sync.narrationStartAt: narração começa no tempo do vídeo definido nos dados", async () => {
    const s = vid("v", ["v1"], null);
    s.sync = { narrationStartAt: { clip: 0, time: 2.5 } };
    const h = createHarness(tourOf([s]));
    await h.engine.start();
    await flush();
    expect(h.narration.starts).toBe(0);
    expect(h.store.get().narration).toBe("waiting");
    expect(h.video.timeWatchers[0]).toMatchObject({ clip: 0, time: 2.5 });
    h.video.timeWatchers[0].cb();
    await flush();
    expect(h.narration.starts).toBe(1);
  });
});
