/**
 * Validação do roteiro (scenes.ts) e do manifest de mídia.
 * Falha o build de testes se houver id repetido, `next` inválido, cena inalcançável,
 * clip/narração/panorama sem arquivo no manifest, ou variante ausente em disco.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tour } from "../src/tour/scenes";
import { popupMediaIds } from "../src/tour/popups";
import { isVideo } from "../src/tour/sceneRules";

/** Assets de pop-up ainda não entregues (marcados `pending` em popups.ts; ver MISSING_POPUPS.md). */
const PENDING = new Set(popupMediaIds().filter((m) => m.pending).map((m) => m.id));
const overlayMedia = (o: { src?: string; slides?: { src: string }[] }) => [...(o.src ? [o.src] : []), ...(o.slides ?? []).map((x) => x.src)];

const MEDIA_DIR = join(__dirname, "..", "public", "media");
const manifestPath = join(MEDIA_DIR, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

function mediaIds() {
  const ids: string[] = [];
  for (const s of tour.scenes) {
    const media = s.media;
    if (media.type === "video") media.clips.forEach((c) => ids.push(c.src));
    else ids.push(media.src);
    if (s.narration) ids.push(s.narration);
    for (const o of s.overlays) for (const id of overlayMedia(o)) if (!PENDING.has(id)) ids.push(id);
  }
  return ids;
}

describe("roteiro (scenes.ts)", () => {
  it("tem as 13 cenas com ids únicos", () => {
    const ids = tour.scenes.map((s) => s.id);
    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo `next` aponta para uma cena existente e só a última não tem próxima", () => {
    const ids = new Set(tour.scenes.map((s) => s.id));
    for (const s of tour.scenes) if (s.next) expect(ids.has(s.next), `${s.id}.next`).toBe(true);
    expect(tour.scenes.filter((s) => s.next === null).map((s) => s.id)).toEqual(["e5-p1"]);
  });

  it("todas as cenas são alcançáveis a partir da primeira, sem ciclos", () => {
    const byId = new Map(tour.scenes.map((s) => [s.id, s]));
    const seen: string[] = [];
    let cur: string | null = tour.firstScene;
    while (cur) {
      expect(seen, "ciclo no roteiro").not.toContain(cur);
      seen.push(cur);
      cur = byId.get(cur)!.next;
    }
    expect(seen).toHaveLength(tour.scenes.length);
  });

  it("pop-ups espaciais têm âncora válida (yaw/pitch/largura em graus)", () => {
    for (const s of tour.scenes)
      for (const o of s.overlays) {
        if (!o.anchor) continue;
        expect(o.anchor.yaw, `${s.id}/${o.id} yaw`).toBeGreaterThanOrEqual(-180);
        expect(o.anchor.yaw, `${s.id}/${o.id} yaw`).toBeLessThanOrEqual(180);
        expect(Math.abs(o.anchor.pitch), `${s.id}/${o.id} pitch`).toBeLessThanOrEqual(80);
        expect(o.anchor.width, `${s.id}/${o.id} largura`).toBeGreaterThan(5);
        expect(o.anchor.width, `${s.id}/${o.id} largura`).toBeLessThan(120);
      }
  });

  it("cenas de vídeo têm clips e volume ambiente válidos", () => {
    for (const s of tour.scenes) {
      if (!isVideo(s)) continue;
      expect(s.media.clips.length, s.id).toBeGreaterThan(0);
      expect(s.media.ambientVolume).toBeGreaterThanOrEqual(0);
      expect(s.media.ambientVolume).toBeLessThanOrEqual(1);
    }
  });

  it("nenhum caminho de mídia é absoluto ou tem extensão (ids lógicos)", () => {
    for (const id of mediaIds()) {
      expect(id).not.toMatch(/^([a-z]+:|\/|[A-Z]:\\)/i);
      expect(id).not.toMatch(/\.(mp4|jpg|mp3)$/i);
    }
  });
});

describe.skipIf(!manifest)("manifest de mídia", () => {
  it("toda mídia referenciada existe no manifest com arquivos em disco", () => {
    for (const id of mediaIds()) {
      const asset = manifest.assets[id];
      expect(asset, `manifest sem "${id}" — rode npm run media`).toBeTruthy();
      for (const [profile, v] of Object.entries<{ file: string }>(asset.variants)) {
        expect(existsSync(join(MEDIA_DIR, v.file)), `${id} [${profile}] → ${v.file}`).toBe(true);
      }
    }
  });

  it("música de fundo existe no manifest", () => {
    if (tour.music) expect(manifest.assets[tour.music.src], tour.music.src).toBeTruthy();
  });

  it("vídeos têm perfis mobile e web; panoramas são 2:1", () => {
    for (const [id, a] of Object.entries<any>(manifest.assets)) {
      if (a.kind === "video") expect(Object.keys(a.variants).sort(), id).toEqual(["mobile", "web"]);
      if (a.kind === "image") for (const v of Object.values<any>(a.variants)) expect(v.width / v.height, id).toBe(2);
    }
  });

  it("pop-ups: cada cue aponta para um overlay da cena, com mídia no manifest e tempos dentro da narração", () => {
    for (const s of tour.scenes) {
      const ids = new Set(s.overlays.map((o) => o.id));
      for (const o of s.overlays)
        for (const id of overlayMedia(o))
          if (!PENDING.has(id)) expect(manifest.assets[id], `${s.id}: overlay ${o.id} sem mídia "${id}"`).toBeTruthy();
      const narration = s.narration ? manifest.assets[s.narration]?.variants?.web?.duration : undefined;
      for (const c of s.cues) {
        if (c.action.type === "showOverlay") expect(ids.has(c.action.overlayId), `${s.id}: cue ${c.id} → overlay inexistente`).toBe(true);
        if (c.timeline === "narration") {
          expect(narration, `${s.id}: cue de narração sem narração`).toBeTypeOf("number");
          expect(c.from, `${s.id}: ${c.id} começa depois do fim da narração`).toBeLessThan(narration);
          if (c.to !== undefined) expect(c.to, `${s.id}: ${c.id}`).toBeGreaterThan(c.from);
        }
      }
    }
  });
});
