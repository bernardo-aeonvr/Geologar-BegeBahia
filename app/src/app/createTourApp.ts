/**
 * Monta os serviços do tour (fora do React). A UI só conversa com `engine` e lê `store`.
 */
import { appConfig } from "../config/appConfig";
import { createLogger, setLogLevel } from "../lib/log";
import { AssetPreloader } from "../media/AssetPreloader";
import { AudioBus } from "../media/AudioBus";
import { loadManifest } from "../media/manifest";
import { detectProfiles, MediaResolver } from "../media/MediaResolver";
import { NarrationController } from "../media/NarrationController";
import { VideoController } from "../media/VideoController";
import { tour } from "../tour/scenes";
import { TourEngine } from "../tour/TourEngine";
import { createTourStore } from "../tour/tourStore";
import { PanoramaRenderer } from "../viewer/PanoramaRenderer";

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

  const dispose = () => {
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
      unlockAudio: () => bus.unlock([narration.el, ...video.elements]),
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}

export type TourApp = Awaited<ReturnType<typeof createTourApp>>;
