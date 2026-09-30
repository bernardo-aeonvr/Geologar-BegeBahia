/**
 * Validação do roteiro (scenes.ts) e do manifest de mídia.
 * Falha o build de testes se houver id repetido, `next` inválido, cena inalcançável,
 * clip/narração/panorama sem arquivo no manifest, ou variante ausente em disco.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tour } from "../src/tour/scenes";
import { isVideo } from "../src/tour/sceneRules";

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

  it("vídeos têm perfis mobile e web; panoramas são 2:1", () => {
    for (const [id, a] of Object.entries<any>(manifest.assets)) {
      if (a.kind === "video") expect(Object.keys(a.variants).sort(), id).toEqual(["mobile", "web"]);
      if (a.kind === "image") for (const v of Object.values<any>(a.variants)) expect(v.width / v.height, id).toBe(2);
    }
  });
});
