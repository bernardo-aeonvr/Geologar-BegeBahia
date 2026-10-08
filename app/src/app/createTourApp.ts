/**
 * Monta os serviços do tour (fora do React). A UI só conversa com `engine` e lê `store`.
 */
import { appConfig } from "../config/appConfig";
import { createLogger, setLogLevel } from "../lib/log";
import { AssetPreloader } from "../media/AssetPreloader";
import { AudioBus } from "../media/AudioBus";
import { loadManifest } from "../media/manifest";
import { detectProfiles, MediaResolver } from "../media/MediaResolver";
import { MusicController } from "../media/MusicController";
import { musicTarget } from "../media/musicRules";
import { NarrationController } from "../media/NarrationController";
import { VideoController } from "../media/VideoController";
import { tour } from "../tour/scenes";
import { TourEngine } from "../tour/TourEngine";
import { createTourStore } from "../tour/tourStore";
import { PanoramaRenderer } from "../viewer/PanoramaRenderer";
import type { SpatialOverlaySpec } from "../viewer/SpatialOverlays";

const log = createLogger("app");

export async function createTourApp(container: HTMLElement) {
  setLogLevel(appConfig.debug);
  const store = createTourStore();
  store.set({ volume: appConfig.initialVolume });

  const renderer = new PanoramaRenderer(container, {
    maxPixelRatio: appConfig.maxPixelRatio,
    fovMin: appConfig.fovMin,
    fovMax: appConfig.fovMax,
    enableXR: appConfig.enableXR,
  });
  const bus = new AudioBus();
  const narration = new NarrationController(bus, appConfig.narrationStallMs);
  const video = new VideoController(bus, appConfig.clipAudioCrossfadeMs);
  narration.attach();
  video.attach();
  bus.setVolume(appConfig.initialVolume);

  let unsubscribeSpatial: (() => void) | undefined;
  let unsubscribeMusic: (() => void) | undefined;
  let music: MusicController | null = null;
  const dispose = () => {
    unsubscribeSpatial?.();
    unsubscribeMusic?.();
    music?.dispose();
    engine?.dispose();
    preloader?.clear();
    renderer.dispose();
  };

  let engine: TourEngine | undefined;
  let preloader: AssetPreloader | undefined;
  try {
    const manifest = await loadManifest(appConfig.mediaBaseUrl);
    const profiles = detectProfiles({ forced: appConfig.forcedProfile, maxTextureSize: renderer.maxTextureSize });
    log.info("media", { baseUrl: appConfig.mediaBaseUrl, profiles, maxTextureSize: renderer.maxTextureSize });
    const resolver = new MediaResolver(manifest, appConfig.mediaBaseUrl, profiles);
    preloader = new AssetPreloader(resolver, renderer);

    engine = new TourEngine({
      tour,
      store,
      narration,
      video,
      viewer: renderer,
      preloader,
      audio: bus,
      resolveUrl: (id) => resolver.url(id),
      config: {
        fadeInMs: appConfig.fadeInMs,
        fadeOutMs: appConfig.fadeOutMs,
        loopMinNarrationRemaining: appConfig.loopMinNarrationRemaining,
      },
      log: createLogger("tour"),
    });

    // Pop-ups espaciais: o motor decide QUAIS estão ativos e QUAL slide (store, a partir do tempo
    // da narração); o renderer desenha os que têm `anchor`. Mídias da cena atual + próxima são
    // pré-carregadas (inclusive todas as imagens das sequências). Asset ausente no manifest → null
    // (o pop-up não aparece; nada de placeholder).
    const mediaUrl = (id: string | undefined): string | null => (id && resolver.has(id) ? resolver.url(id) : null);
    const spatialSpecs = (sceneId: string | null, onlyIds?: string[], slides: Record<string, number> = {}): SpatialOverlaySpec[] => {
      const scene = sceneId ? tour.scenes.find((s) => s.id === sceneId) : undefined;
      if (!scene) return [];
      const specs: SpatialOverlaySpec[] = [];
      for (const o of scene.overlays) {
        if (!o.anchor || (onlyIds && !onlyIds.includes(o.id))) continue;
        const slideSrc = o.slides ? o.slides[slides[o.id] ?? 0]?.src : o.src;
        const videoUrl = o.kind === "video" ? mediaUrl(o.src) : null;
        if (o.kind === "video" && !videoUrl) continue; // vídeo ausente: não exibe
        specs.push({
          id: o.id,
          url: o.kind === "video" ? null : mediaUrl(slideSrc),
          preloadUrls: (o.slides ? o.slides.map((s) => s.src) : o.kind === "video" ? [] : [o.src]).map(mediaUrl).filter((u): u is string => !!u),
          ...(videoUrl ? { video: { url: videoUrl, start: o.videoStart ?? 0, ...(o.chromaKey ? { chromaKey: o.chromaKey } : {}) } } : {}),
          ...o.anchor,
          ...(o.crop ? { crop: o.crop } : {}),
        });
      }
      return specs;
    };
    renderer.spatial.setClock(() => {
      const s = store.get();
      const started = s.narration !== "idle" && s.narration !== "loading" && s.narration !== "none";
      return { narrationTime: started ? narration.currentTime : null, running: s.phase === "playing" };
    });
    let lastScene: string | null = null;
    let lastActive: string[] | null = null;
    let lastSlides: Record<string, number> | null = null;
    unsubscribeSpatial = store.subscribe(() => {
      const s = store.get();
      if (s.sceneId !== lastScene) {
        lastScene = s.sceneId;
        const next = tour.scenes.find((x) => x.id === s.sceneId)?.next ?? null;
        renderer.spatial.preload([...spatialSpecs(s.sceneId), ...spatialSpecs(next)]);
      }
      if (s.activeOverlays !== lastActive || s.overlaySlides !== lastSlides) {
        lastActive = s.activeOverlays;
        lastSlides = s.overlaySlides;
        renderer.spatial.setActive(spatialSpecs(s.sceneId, s.activeOverlays, s.overlaySlides));
      }
    });

    // Música de fundo: contínua, com ducking enquanto o narrador fala (regra em musicRules).
    if (tour.music) {
      const m = new MusicController(bus, tour.music, resolver.url(tour.music.src));
      m.attach();
      music = m;
      unsubscribeMusic = store.subscribe(() => m.apply(musicTarget(store.get())));
    }

    // Adianta a primeira cena enquanto o usuário vê a tela inicial.
    const first = tour.scenes.find((s) => s.id === tour.firstScene)!;
    if (first.media.type === "image") void preloader.loadPanorama(first.media.src).catch(() => {});
    else video.prepare(resolver.url(first.media.clips[0].src));
    if (first.narration) void preloader.loadNarration(first.narration);

    return {
      engine,
      store,
      renderer,
      bus,
      narration,
      video,
      preloader,
      resolver,
      tour,
      /** Deve ser chamado DENTRO do gesto do usuário (clique/toque). */
      music,
      unlockAudio: () => bus.unlock([narration.el, ...video.elements, ...(music ? [music.el] : [])]),
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}

export type TourApp = Awaited<ReturnType<typeof createTourApp>>;
