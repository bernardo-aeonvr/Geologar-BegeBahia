# Geologar 360 — app web

Tour virtual 360° do Bege Bahia guiado por narração. Substitui o export 3DVista.
Arquitetura e decisões estão em [`../AUDITORIA_360.md`](../AUDITORIA_360.md).

**Stack:** Vite · TypeScript · React (só UI) · Three.js (viewer, sem R3F) · Vitest.

## Rodar

```bash
cd app
npm install
npm run dev          # http://localhost:5173  (?debug=1 abre o painel de debug)
npm test             # motor, regras, roteiro, manifest e simulação das 13 cenas
npm run build        # typecheck + build em dist/
npm run preview      # serve dist/ localmente
```

Parâmetros de URL úteis:

| Parâmetro | Efeito |
|---|---|
| `?debug=1` | abre o painel de debug (também `Shift+D`) |
| `?profile=mobile\|web\|high` | força o perfil de mídia |
| `?xr=1` | habilita o botão de VR (WebXR — etapa futura) |

## Onde mexer

| Quero mudar… | Arquivo |
|---|---|
| ordem das cenas, panorama, narração, próxima cena | `src/tour/scenes.ts` |
| enquadramento inicial (`initialView` yaw/pitch/fov) | `src/tour/scenes.ts` |
| volume do ambiente (`ambientVolume`), loop, clips obrigatórios | `src/tour/scenes.ts` |
| sincronização narração × vídeo (`sync.narrationStartAt`) | `src/tour/scenes.ts` |
| pop-ups temporizados (`cues` + `overlays`), hotspots, créditos | `src/tour/scenes.ts` |
| fades, origem da mídia, limites de FOV | `src/config/appConfig.ts` |
| arquivo fonte de cada id de mídia | `media-sources.json` |
| qualidade/resolução dos perfis | `scripts/build-media.mjs` (`PROFILES`) |

O player **não** tem regras por cena: o comportamento vem só dos dados.

## Como a cena termina (resumo)

- **Imagem:** a narração termina (`ended`) → fade → próxima cena.
- **Vídeo:** avança quando **(1)** a narração terminou, **(2)** todos os clips `required` foram exibidos inteiros e **(3)** o clip atual chegou ao fim natural.
  - Vídeo mais curto que a narração → `loopWhileNarrating` recomeça; quando a narração acaba, termina o ciclo atual.
  - Vídeo mais longo → toca até o fim.
  - Vários clips (`e3-p1`: 1-1 → 1-2) → todos inteiros, em ordem.
- **Navegação manual** (anterior/próxima/menu) interrompe na hora.

Regras em `src/tour/sceneRules.ts`; orquestração em `src/tour/TourEngine.ts`.

## Mídia

As fontes originais ficam em `../4 - novos 360/` e `../Narracao/` e nunca são alteradas.
`npm run media` gera as variantes em `public/media/` e o `manifest.json`:

| Tipo | mobile | web | high |
|---|---|---|---|
| vídeo | 2880×1440 H.264 ~8 Mbps | 4096×2048 H.264 ~16 Mbps | (futuro: 5,7K HEVC) |
| panorama | 4096×2048 | 4096×2048 | original 6528×3264 |
| narração | MP3 original | idem | idem |

`npm run media:check` só valida. Requer `ffmpeg`/`ffprobe` no PATH.
O `MediaResolver` escolhe a variante (celular → mobile; desktop/Quest → web; imagem original só em desktop com textura ≥ 8192).

## Deploy (multi-target)

O build é **autocontido** (sem CDN, APIs ou fontes externas) e usa `base: "./"`, então funciona em
`localhost`, em `https://usuario.github.io/repositorio/` e num pacote local.

- **GitHub Pages:** publicar `dist/` (inclui `media/` com as variantes). Git LFS é só versionamento —
  o Pages não serve arquivos LFS, então o workflow precisa fazer checkout com LFS e publicar o artefato.
- **Servidor próprio / CDN:** `VITE_MEDIA_BASE_URL=https://…/` no build (ver `.env.example`).
  O servidor deve aceitar HTTP Range e, se for outra origem, enviar CORS (vídeo vira textura WebGL
  e passa pelo Web Audio).
- **Offline (Quest):** servir `dist/` localmente (não funciona via `file://` por causa de módulos ES).
