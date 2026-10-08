#!/usr/bin/env node
/**
 * Pipeline de mídia do Geologar 360.
 *
 * Lê `media-sources.json` (id lógico → arquivo fonte original), gera as variantes por perfil em
 * `public/media/` e escreve `public/media/manifest.json`. As fontes originais nunca são alteradas.
 *
 *   npm run media                 gera o que estiver faltando/desatualizado
 *   npm run media -- --only video/e3-p1-1   um id (pode repetir)
 *   npm run media -- --force      regenera tudo
 *   npm run media:check           só valida (fontes, saídas e manifest), sem codificar
 *
 * Perfis (ver AUDITORIA_360.md §9):
 *   imagem  mobile/web → 4096×2048 JPEG · high → original (cópia byte a byte)
 *   vídeo   mobile → 2880×1440 H.264 · web → 4096×2048 H.264 High · high → reservado (5,7K HEVC futuro)
 *   áudio   cópia do MP3 original (sem recodificar)
 *   overlay pop-ups PNG copiados como estão (sem redimensionar)
 *
 * Requer ffmpeg/ffprobe no PATH.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_DIR, "..");
const OUT_DIR = join(APP_DIR, "public", "media");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");
const SOURCES = JSON.parse(readFileSync(join(APP_DIR, "media-sources.json"), "utf8"));

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const FORCE = args.includes("--force");
const ONLY = args.flatMap((a, i) => (a === "--only" ? [args[i + 1]] : []));

/** Definição dos perfis. Mudar aqui → o hash muda → a variante é regenerada. */
const PROFILES = {
  image: {
    web: { width: 4096, height: 2048, quality: 3, suffix: "4096" },
    mobile: { sameAs: "web" },
    high: { copy: true, suffix: "orig" },
  },
  video: {
    web: { width: 4096, height: 2048, crf: 20, maxrate: "16M", bufsize: "32M", suffix: "4096" },
    mobile: { width: 2880, height: 1440, crf: 22, maxrate: "8M", bufsize: "16M", suffix: "2880" },
  },
  audio: {
    web: { copy: true },
    mobile: { sameAs: "web" },
    high: { sameAs: "web" },
  },
  // Pop-ups/imagens de interface: cópia byte a byte (já vêm no tamanho certo, com transparência).
  overlay: {
    web: { copy: true },
    mobile: { sameAs: "web" },
    high: { sameAs: "web" },
  },
};

const log = (...m) => console.log("[media]", ...m);

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} falhou (${r.status}):\n${(r.stderr || "").slice(-2000)}`);
  return r.stdout;
}

function probe(file) {
  const out = JSON.parse(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]),
  );
  const v = out.streams.find((s) => s.codec_type === "video");
  const hasAudio = out.streams.some((s) => s.codec_type === "audio");
  const duration = out.format?.duration ? Number(Number(out.format.duration).toFixed(3)) : undefined;
  return { width: v?.width, height: v?.height, duration, hasAudio };
}

function hashOf(obj) {
  return createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 12);
}

function extOf(kind, source = "") {
  // Overlays mantêm o formato do arquivo original (PNG com transparência, MP4 de animação…).
  if (kind === "overlay") return (source.split(".").pop() || "png").toLowerCase();
  return { image: "jpg", video: "mp4", audio: "mp3" }[kind];
}

function encodeImage(src, dst, p) {
  run("ffmpeg", [
    "-v", "error", "-y", "-i", src,
    "-vf", `scale=${p.width}:${p.height}:flags=lanczos`,
    "-pix_fmt", "yuvj420p", "-q:v", String(p.quality), "-frames:v", "1", dst,
  ]);
}

function encodeVideo(src, dst, p, outPoint) {
  // H.264 High, CRF limitado por maxrate (qualidade constante com teto de bitrate), keyframe a cada 2 s,
  // moov no início (+faststart) para streaming por HTTP Range. Mantém o áudio ambiente (D3).
  // outPoint: a variante termina ali (a fonte não é alterada) — remove o fade para preto embutido.
  run(
    "ffmpeg",
    [
      "-v", "error", "-stats", "-y", "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
      "-vf", `scale=${p.width}:${p.height}:flags=lanczos`,
      "-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-level:v", "5.1",
      "-pix_fmt", "yuv420p", "-crf", String(p.crf), "-maxrate", p.maxrate, "-bufsize", p.bufsize,
      "-g", "50", "-keyint_min", "25",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2",
      ...(outPoint ? ["-t", String(outPoint)] : []),
      "-movflags", "+faststart", dst,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, assets: {} };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function main() {
  const manifest = loadManifest();
  const problems = [];
  const ids = Object.keys(SOURCES).filter((k) => !k.startsWith("$") && (ONLY.length === 0 || ONLY.includes(k)));

  for (const id of ids) {
    const { kind, source, outPoint } = SOURCES[id];
    const srcPath = join(REPO_ROOT, source);
    if (!existsSync(srcPath)) {
      problems.push(`${id}: fonte ausente → ${source}`);
      continue;
    }
    const srcBytes = statSync(srcPath).size;
    const profiles = PROFILES[kind];
    const entry = { kind, source, sourceBytes: srcBytes, variants: {} };
    const prev = manifest.assets[id];

    for (const [profile, def] of Object.entries(profiles)) {
      if (def.sameAs) continue;
      const settings = { kind, def, srcBytes, ...(outPoint ? { outPoint } : {}) };
      const settingsHash = hashOf(settings);
      const name = id.split("/").pop();
      const file = `${dirname(id)}/${name}${def.suffix ? "." + def.suffix : ""}.${extOf(kind, source)}`;
      const outPath = join(OUT_DIR, file);
      const prevVariant = prev?.variants?.[profile];
      const upToDate = !FORCE && existsSync(outPath) && prevVariant?.settingsHash === settingsHash;

      if (CHECK) {
        if (!existsSync(outPath)) problems.push(`${id} [${profile}]: saída ausente → ${file}`);
        else if (!upToDate) problems.push(`${id} [${profile}]: desatualizada (rode npm run media)`);
        if (prevVariant) entry.variants[profile] = prevVariant;
        continue;
      }

      if (!upToDate) {
        mkdirSync(dirname(outPath), { recursive: true });
        const tmp = outPath + ".tmp." + extOf(kind, source);
        const t0 = Date.now();
        log(`${id} [${profile}] ← ${relative(REPO_ROOT, srcPath)}`);
        if (def.copy) copyFileSync(srcPath, tmp);
        else if (kind === "image") encodeImage(srcPath, tmp, def);
        else if (kind === "video") encodeVideo(srcPath, tmp, def, outPoint);
        renameSync(tmp, outPath);
        log(`  ok em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }

      const info = probe(outPath);
      entry.variants[profile] = {
        file,
        bytes: statSync(outPath).size,
        ...(info.width ? { width: info.width, height: info.height } : {}),
        ...(kind === "video" || kind === "audio" || info.duration ? { duration: info.duration, hasAudio: info.hasAudio } : {}),
        settingsHash,
      };
    }
    // Perfis que reutilizam outro arquivo (ex.: imagem mobile = web).
    for (const [profile, def] of Object.entries(profiles)) {
      if (def.sameAs && entry.variants[def.sameAs]) entry.variants[profile] = { ...entry.variants[def.sameAs] };
    }
    manifest.assets[id] = entry;
  }

  if (!CHECK) {
    manifest.version = 1;
    manifest.generatedAt = new Date().toISOString();
    manifest.profiles = Object.fromEntries(
      Object.entries(PROFILES).map(([k, v]) => [k, Object.keys(v)]),
    );
    mkdirSync(OUT_DIR, { recursive: true });
    const sorted = Object.fromEntries(Object.keys(manifest.assets).sort().map((k) => [k, manifest.assets[k]]));
    writeFileSync(MANIFEST_PATH, JSON.stringify({ ...manifest, assets: sorted }, null, 2) + "\n");
    log(`manifest → ${relative(APP_DIR, MANIFEST_PATH)} (${Object.keys(sorted).length} assets)`);
  }

  // Relatório de tamanho por perfil (útil para o limite de 1 GB do GitHub Pages).
  const totals = {};
  for (const a of Object.values(manifest.assets)) {
    const seen = new Set();
    for (const [p, v] of Object.entries(a.variants ?? {})) {
      totals[p] ??= 0;
      totals[p] += v.bytes;
      seen.add(v.file);
    }
  }
  log("total por perfil:", Object.entries(totals).map(([p, b]) => `${p} ${(b / 1e6).toFixed(0)} MB`).join(" · "));

  if (problems.length) {
    console.error("[media] PROBLEMAS:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  log(CHECK ? "check ok" : "concluído");
}

main();
