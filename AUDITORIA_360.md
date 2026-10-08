# Geologar 360 — Auditoria, decisões e arquitetura

> Auditoria inicial: 2026-09-30 · Decisões D1–D10 definidas pelo cliente em 2026-09-30.
> Escopo: substituir o tour 3DVista por uma experiência Web 360 própria, onde a narração e os vídeos comandam a navegação.
> As pastas de mídia originais (`4 - novos 360/`, `Narracao/`) nunca são modificadas.

---

## 0. Decisões definitivas

| # | Tema | Decisão |
|---|---|---|
| D1 | Etapa 3 · Ponto 1 | Usar **os dois vídeos** inteiros, sem cortes. A cena só avança depois que os dois terminarem, mesmo com a narração (22 s) já encerrada. **Revisado (2026-10-08):** a ordem é `1-2` → `1-1`, que é a ordem da ação: primeiro o bloco desce do caminhão, depois a ponte rolante o leva até o tear. |
| D2 | Vídeo mais curto que a narração | `loop` enquanto a narração toca. Quando a narração termina, **o ciclo atual do vídeo é concluído** e só então há o fade para a próxima cena. `hold` não é usado. **Revisado (2026-10-08):** no tear (Etapa 3 · P2–P3) e nas politrizes (P4–P6), a cena avança **assim que a narração termina**, sem completar o ciclo. |
| D3 | Áudio ambiente dos vídeos | Mantido, **baixo por baixo da narração**, com `ambientVolume` inicial de **0,15**, configurável por cena e por clip. Vídeo sem ambiente útil (Etapa 3 · Ponto 6) fica em silêncio, sem ruído artificial. **Revisado (2026-10-08):** o 0,15 fixo deixava as máquinas a ~13 dB da voz e cobria a narração (principalmente no tear antigo). Agora cada clip é nivelado por loudness em −35 LUFS, ~22 dB abaixo da narração (`AMBIENT_LUFS` em `scenes.ts`). |
| D4 | Stack | **Vite + TypeScript + React + Three.js**. O Three.js é usado diretamente, dentro de um componente React e sem R3F, para manter controle explícito de textura, `VideoTexture`, descarte, preload, renderer, WebXR e memória de GPU. |
| D5 | Materiais visuais que faltam | Não inventar substitutos. Implementar só a infraestrutura (`cues`, `hotspots`, `overlays`, `credits`), com arrays vazios até os materiais chegarem. |
| D6 | "aguarda" × "guarda" | O áudio atual da Etapa 5 fica. A diferença está aceita nesta versão. |
| D7 | Localização | App em `D:\Git\Geologar2\app\`. As pastas originais ficam intactas na raiz. |
| D8 | Versionamento | Repositório único com raiz em `D:\Git\Geologar2`, no remoto `bernardo-aeonvr/Geologar-BegeBahia` e na branch `feature/geologar-360-web` (criada a partir de `main`). Vídeos (`*.mp4`, `*.mov`) vão no **Git LFS**. **Versionamento ≠ entrega:** o build publicado nunca depende de LFS. |
| D9 | Deploy multi-target | GitHub Pages (agora), servidor próprio (depois) e offline no Quest (depois). Caminhos lógicos em `scenes.ts`, `mediaBaseUrl` configurável, um `manifest.json` com **perfis de mídia** e um `MediaResolver` que escolhe a variante. |
| D10 | Final | A narração da Etapa 5 termina → créditos/logos em pop-up reduzido (quando houver material) → **volta direto ao menu inicial**, que limpa estado, áudio, vídeos e mídia, sai do VR e mostra de novo a primeira vista ao fundo. Sem reinício automático. **Revisado (2026-10-08):** a tela de conclusão com "Recomeçar" foi removida a pedido do cliente. |

### Pontos em aberto (surgiram na execução)

| # | Tema | Situação |
|---|---|---|
| A1 | **GitHub Pages do repositório** | O Pages do repo **já está ativo** e serve o tour 3DVista antigo (build legado, a partir de `main /`). Um repositório tem **um só site Pages**, então publicar a versão nova nele **substitui o site antigo**. Mudar a origem para "GitHub Actions" exige permissão de **admin**, e a conta `BernardoHille` tem só `push`. É preciso decidir entre substituir o site atual (com o dono do repo alterando a origem do Pages) ou publicar em outro repositório/URL. O build já está pronto para qualquer uma das duas. |
| A2 | Etapa 2 · Ponto 2 inteiro (42,6 s) — **resolvido:** a cena agora avança no fim da narração | Pela regra do caso B, o vídeo toca até o fim: 28 s além da narração. Por volta dos 40 s, **o operador aparece na frente da câmera**. |
| A4 | Fade para preto embutido nos vídeos | Todos os vídeos da Etapa 3 e da Etapa 4 terminam com cerca de 1 s de fade para preto, seguido de ~0,8 s de preto. Isso aparecia a cada loop e na troca `1-2` → `1-1`, e os pop-ups continuavam acesos sobre a imagem preta. **Resolvido:** `outPoint` em `media-sources.json` corta esse trecho nas variantes geradas (as fontes não mudam). Com isso, o vídeo da Etapa 4 passa a ter 27,7 s × narração de 29,78 s, e `loopMinNarrationRemaining: 3` segura o último quadro por ~2 s em vez de fazer um ciclo inteiro extra. |
| A3 | Loop por fração de segundo | Na Etapa 4, o vídeo tem 29,6 s e a narração 29,78 s. Pela regra pura, faltariam 0,18 s de narração e o vídeo daria **um ciclo inteiro a mais (+29,6 s)**. Para evitar isso existe `loopMinNarrationRemaining`, com padrão de 1,0 s e configurável por cena: se faltar menos que isso de narração quando o vídeo acaba, ele não reinicia e a cena termina junto com a narração. Com 0, vale a regra pura. |

---

## 1. Stack atual

**Não existe código no projeto.** O conteúdo de `D:\Git\Geologar2` é:

```
4 - novos 360/                              14 arquivos (5 JPG + 9 MP4), cerca de 3,9 GB
Narracao/                                   14 MP3 + mapa_audio.md
Roteiro_Geologar_Bege_Bahia_Revisado.pdf    14 páginas, exportado do Google Docs
```

A pasta não é um repositório git. A stack será definida do zero (seção 9).

---

## 2. Panoramas encontrados (`4 - novos 360/`)

### Imagens (5)

Todas são JPEG equiretangulares de **6528 × 3264**, com proporção exata de **2:1**. Têm metadados GPano e orientação EXIF 1 (normal), e foram feitas com a câmera Insta360 ONE RS.

| Arquivo | Resolução | Tamanho |
|---|---|---|
| Etapa 0 Introducao.jpg | 6528 × 3264 | 2,5 MB |
| Etapa 1 Ponto 1.jpg | 6528 × 3264 | 2,2 MB |
| Etapa 1 Ponto 2.jpg | 6528 × 3264 | 2,3 MB |
| Etapa 2 Ponto 1.jpg | 6528 × 3264 | 1,9 MB |
| Etapa 5.jpg | 6528 × 3264 | 2,6 MB |

**Observação:** as imagens não estão em 8192 × 4096. A resolução de 6528 × 3264 é a nativa da câmera e é adequada para o projeto.

**Memória de GPU (RGBA):**
- 6528 × 3264 ocupa cerca de 85 MB, ou cerca de 113 MB com mipmaps.
- 4096 × 2048 ocupa cerca de 34 MB, ou cerca de 45 MB com mipmaps.

As versões de Etapa 1 Ponto 2 e Etapa 2 Ponto 1 já estão com o nadir (tripé) corrigido em relação às imagens do PDF.

### Vídeos 360 (9)

Todos são H.264 Main em **6144 × 3072**, a 25 fps, em projeção equiretangular mono (sem estéreo 3D). O bitrate é de **cerca de 145–158 Mbps** e todos têm uma trilha de áudio AAC.

| Arquivo | Duração | Tamanho | Áudio embutido |
|---|---|---|---|
| Etapa 2 Ponto 2.mp4 | 42,6 s | 762 MB | ambiente |
| Etapa 3 Ponto 1-1.mp4 | 26,2 s | 485 MB | ambiente |
| Etapa 3 Ponto 1-2.mp4 | 7,8 s | 155 MB | ambiente |
| Etapa 3 Ponto 2.mp4 | 20,0 s | 377 MB | ambiente |
| Etapa 3 Ponto 3.mp4 | 23,0 s | 428 MB | ambiente |
| Etapa 3 Ponto 4.mp4 | 23,2 s | 431 MB | ambiente |
| Etapa 3 Ponto 5.mp4 | 12,8 s | 241 MB | ambiente |
| Etapa 3 Ponto 6.mp4 | 24,4 s | 442 MB | silêncio (−91 dB) |
| Etapa 4.mp4 | 29,6 s | 544 MB | ambiente |

**Os vídeos não podem ir para a web como estão:**
- A 150 Mbps, não há streaming viável.
- H.264 em 6144 px passa do limite do decodificador em iOS, em boa parte dos Androids e muito provavelmente no navegador do Quest.

Por isso é obrigatório gerar versões derivadas, sem alterar os originais (seção 10).

---

## 3. Narrações encontradas (`Narracao/`)

Todas são MP3 de 44,1 kHz, estéreo, com CBR de ~192 kbps.

| Arquivo | Duração |
|---|---|
| Etapa 0 Intro.MP3 | 39,97 s |
| Etapa 1 Ponto 1.MP3 | 45,71 s |
| Etapa 1 Ponto 2.MP3 | 44,56 s |
| Etapa 2 Ponto 1.MP3 | 31,45 s |
| Etapa 2 Ponto 2.MP3 | 14,68 s |
| Etapa 3 Ponto 1.MP3 | 22,15 s |
| Etapa 3 Ponto 2.MP3 | 16,98 s |
| Etapa 3 Ponto 3.MP3 | 31,40 s |
| Etapa 3 Ponto 4.MP3 | 27,56 s |
| Etapa 3 Ponto 5.MP3 | 15,23 s |
| Etapa 3 Ponto 6.MP3 | 43,57 s |
| Etapa 4 Ponto 1.MP3 | 29,78 s |
| Etapa 5 Ponto 1.MP3 | 43,49 s |
| `continuacao-narracao.MP3` | 208,01 s (**fonte**, não entra no tour) |

O `mapa_audio.md` documenta o corte de `continuacao-narracao.MP3` nos trechos da Etapa 3 Ponto 2 até a Etapa 5 Ponto 1.

---

## 4. Roteiro utilizado

O roteiro usado é **`Roteiro_Geologar_Bege_Bahia_Revisado.pdf`**, o único roteiro do projeto. O texto foi lido por completo.

Cada página do PDF tem uma imagem de referência. Essas imagens foram extraídas e comparadas lado a lado com os arquivos da pasta. **Todas as correspondências foram confirmadas visualmente**, e não apenas pelo nome do arquivo.

As páginas 5 a 12 são capturas de tela do enquadramento usado no 3DVista. Elas servem de referência para definir o `initialView` de cada cena.

---

## 5. Sequência de cenas extraída do roteiro

```
Etapa 01 — Introdução (Lapier)
Panorama: Etapa 0 Introducao.jpg
Narração: Etapa 0 Intro.MP3
Próxima etapa: Etapa 02

Etapa 02 — Etapa 1 · Ponto 1 — Estrada (Ourolândia)
Panorama: Etapa 1 Ponto 1.jpg
Narração: Etapa 1 Ponto 1.MP3
Próxima etapa: Etapa 03

Etapa 03 — Etapa 1 · Ponto 2 — Parte de cima da pedreira
Panorama: Etapa 1 Ponto 2.jpg
Narração: Etapa 1 Ponto 2.MP3
Próxima etapa: Etapa 04

Etapa 04 — Etapa 2 · Ponto 1 — Parte de baixo da pedreira
Panorama: Etapa 2 Ponto 1.jpg
Narração: Etapa 2 Ponto 1.MP3
Próxima etapa: Etapa 05

Etapa 05 — Etapa 2 · Ponto 2 — Corte do bloco (vídeo)
Panorama: Etapa 2 Ponto 2.mp4
Narração: Etapa 2 Ponto 2.MP3
Próxima etapa: Etapa 06

Etapa 06 — Etapa 3 · Ponto 1 — Ponte rolante / transporte do bloco (vídeo)
Panorama: Etapa 3 Ponto 1-1.mp4 → Etapa 3 Ponto 1-2.mp4 (ambos inteiros, D1)
Narração: Etapa 3 Ponto 1.MP3
Próxima etapa: Etapa 07

Etapa 07 — Etapa 3 · Ponto 2 — Tear tradicional (vídeo)
Panorama: Etapa 3 Ponto 2.mp4
Narração: Etapa 3 Ponto 2.MP3
Próxima etapa: Etapa 08

Etapa 08 — Etapa 3 · Ponto 3 — Tear multifio (vídeo)
Panorama: Etapa 3 Ponto 3.mp4
Narração: Etapa 3 Ponto 3.MP3
Próxima etapa: Etapa 09

Etapa 09 — Etapa 3 · Ponto 4 — Politriz manual (vídeo)
Panorama: Etapa 3 Ponto 4.mp4
Narração: Etapa 3 Ponto 4.MP3
Próxima etapa: Etapa 10

Etapa 10 — Etapa 3 · Ponto 5 — Politriz semiautomática (vídeo)
Panorama: Etapa 3 Ponto 5.mp4
Narração: Etapa 3 Ponto 5.MP3
Próxima etapa: Etapa 11

Etapa 11 — Etapa 3 · Ponto 6 — Politriz automática (vídeo)
Panorama: Etapa 3 Ponto 6.mp4
Narração: Etapa 3 Ponto 6.MP3
Próxima etapa: Etapa 12

Etapa 12 — Etapa 4 — Área de reaproveitamento / reciclagem (vídeo)
Panorama: Etapa 4.mp4
Narração: Etapa 4 Ponto 1.MP3
Próxima etapa: Etapa 13

Etapa 13 — Etapa 5 — Vista panorâmica final
Panorama: Etapa 5.jpg
Narração: Etapa 5 Ponto 1.MP3
Próxima etapa: — (fim → créditos → tela de conclusão)
```

---

## 6. Mapeamento ROTEIRO → PANORAMA → NARRAÇÃO → PRÓXIMA CENA

| # | id | Roteiro | Panorama | Narração | Vídeo × narração | Próxima |
|---|---|---|---|---|---|---|
| 01 | `intro` | Introdução — Lapier | Etapa 0 Introducao.jpg | Etapa 0 Intro.MP3 | imagem | `e1-p1` |
| 02 | `e1-p1` | Etapa 1 · Ponto 1 — Estrada | Etapa 1 Ponto 1.jpg | Etapa 1 Ponto 1.MP3 | imagem | `e1-p2` |
| 03 | `e1-p2` | Etapa 1 · Ponto 2 — Topo da pedreira | Etapa 1 Ponto 2.jpg | Etapa 1 Ponto 2.MP3 | imagem | `e2-p1` |
| 04 | `e2-p1` | Etapa 2 · Ponto 1 — Base da pedreira | Etapa 2 Ponto 1.jpg | Etapa 2 Ponto 1.MP3 | imagem | `e2-p2` |
| 05 | `e2-p2` | Etapa 2 · Ponto 2 — Corte do bloco | Etapa 2 Ponto 2.mp4 | Etapa 2 Ponto 2.MP3 | 42,6 s × 14,7 s ✅ | `e3-p1` |
| 06 | `e3-p1` | Etapa 3 · Ponto 1 — Ponte rolante | Etapa 3 Ponto 1-1.mp4 → 1-2.mp4 (D1) | Etapa 3 Ponto 1.MP3 | 26,2 (+7,8) s × 22,2 s | `e3-p2` |
| 07 | `e3-p2` | Etapa 3 · Ponto 2 — Tear tradicional | Etapa 3 Ponto 2.mp4 | Etapa 3 Ponto 2.MP3 | 20,0 s × 17,0 s ✅ | `e3-p3` |
| 08 | `e3-p3` | Etapa 3 · Ponto 3 — Tear multifio | Etapa 3 Ponto 3.mp4 | Etapa 3 Ponto 3.MP3 | **23,0 s × 31,4 s** ⚠️ | `e3-p4` |
| 09 | `e3-p4` | Etapa 3 · Ponto 4 — Politriz manual | Etapa 3 Ponto 4.mp4 | Etapa 3 Ponto 4.MP3 | **23,2 s × 27,6 s** ⚠️ | `e3-p5` |
| 10 | `e3-p5` | Etapa 3 · Ponto 5 — Politriz semiautomática | Etapa 3 Ponto 5.mp4 | Etapa 3 Ponto 5.MP3 | **12,8 s × 15,2 s** ⚠️ | `e3-p6` |
| 11 | `e3-p6` | Etapa 3 · Ponto 6 — Politriz automática | Etapa 3 Ponto 6.mp4 | Etapa 3 Ponto 6.MP3 | **24,4 s × 43,6 s** ⚠️ | `e4-p1` |
| 12 | `e4-p1` | Etapa 4 — Reaproveitamento | Etapa 4.mp4 | Etapa 4 Ponto 1.MP3 | 29,6 s × 29,8 s ≈ | `e5-p1` |
| 13 | `e5-p1` | Etapa 5 — Vista panorâmica final | Etapa 5.jpg | Etapa 5 Ponto 1.MP3 | imagem | *(fim)* |

A sequência do roteiro é linear, sem desvios nem ramificações. São 13 cenas feitas com 14 arquivos de panorama e 13 narrações.

---

## 7. Arquivos sem correspondência

- `Narracao/continuacao-narracao.MP3` é o áudio de origem, já fatiado. **Não entra no tour.**
- `Narracao/mapa_audio.md` é documentação. **Não entra no tour.**
- `4 - novos 360/Etapa 3 Ponto 1-2.mp4` é usado depois do `1-1` na mesma cena (D1).
- Nenhuma narração ficou sem panorama, e nenhum panorama ficou sem narração.

---

## 8. Inconsistências encontradas

### a. Nomes não uniformes

| Panorama | Narração |
|---|---|
| `Etapa 0 Introducao.jpg` | `Etapa 0 Intro.MP3` |
| `Etapa 4.mp4` | `Etapa 4 Ponto 1.MP3` |
| `Etapa 5.jpg` | `Etapa 5 Ponto 1.MP3` |
| `Etapa 3 Ponto 1-1.mp4` / `1-2.mp4` | `Etapa 3 Ponto 1.MP3` |

**Solução:** o pipeline de mídia gera cópias com nomes normalizados (`e0-intro`, `e4-p1`…). Os originais não são renomeados, e a associação fica explícita em `scenes.ts`, não dependendo da ordem alfabética.

### b. Etapa 3 Ponto 1: "Junção dos 3 vídeos"

- O roteiro lista 3 links, mas existem só 2 arquivos (`1-1` e `1-2`).
- Nos frames do `1-1`, a câmera muda de posição por volta dos 18–20 s. Então o `1-1` provavelmente já junta 2 vídeos, e o `1-2` seria o terceiro.
- A imagem de referência do PDF (p.6, com o caminhão) corresponde ao conteúdo do `1-2`.
- Juntos, os vídeos somam 34 s, contra 22,2 s de narração. Em sequência simples, só uns 4 s do `1-2` apareceriam antes da narração terminar.

### c. Vídeo mais curto que a narração (4 cenas)

| Cena | Vídeo | Narração | Falta |
|---|---|---|---|
| Etapa 3 · Ponto 3 | 23,0 s | 31,4 s | 8,4 s |
| Etapa 3 · Ponto 4 | 23,2 s | 27,6 s | 4,4 s |
| Etapa 3 · Ponto 5 | 12,8 s | 15,2 s | 2,4 s |
| Etapa 3 · Ponto 6 | 24,4 s | 43,6 s | 19,2 s |
| Etapa 4 | 29,6 s | 29,8 s | 0,2 s |

Decisão D2: `loop` enquanto a narração toca, concluindo o ciclo atual antes de avançar. Para a Etapa 4, ver A3.

### d. Elementos visuais do roteiro ausentes nos arquivos

| Onde | O que o roteiro pede | Situação |
|---|---|---|
| Introdução | Imagem "Distância Salvador → Ourolândia" | ausente |
| Etapa 1 · Ponto 1 | Pop-up Travertino Romano × Bege Bahia, durante a comparação | ausente |
| Etapa 1 · Ponto 2 | Calcrete × Bege Bahia; imagem microscópica (opcional) | ausente |
| Etapa 2 · Ponto 2 | "Manter a animação já existente que demonstra o corte do bloco" | **não está no vídeo novo** (frames conferidos) |
| Etapa 2 · Ponto 2 | Fio helicoidal × fio diamantado (opcional) | ausente |
| Etapa 3 · Ponto 3 | "Manter a comparação/animação de consumo de água" (200.000 L × 13.000 L) | aparece no PDF p.8 como sobreposição do 3DVista; **não está no vídeo novo** |
| Etapa 3 · Ponto 6 | Aplicação de compósito (opcional) | ausente |
| Etapa 4 | Ladrilhos, placas, moledos, outros produtos | ausente |
| Etapa 5 | Aplicações arquitetônicas em pequenos pop-ups | ausente |
| Etapa 5 | Créditos e logos institucionais em pop-up reduzido | ausente |

### e. Diferenças entre a narração e o roteiro (do `mapa_audio.md`)

- **Etapa 5:** o narrador diz "a Terra ainda **aguarda**", mas o roteiro diz "**guarda**". Muda o sentido, e é o ponto que mais merece conferência.
- **Etapa 3 · Ponto 6:** o áudio diz "Esse novo material pode ser utilizado em aplicação", e o roteiro diz "Esses novos materiais podem ser utilizados em aplicações".
- **Etapa 3 · Pontos 3 e 5:** diferenças menores de uma palavra, que não mudam o sentido.

### f. Áudio embutido nos vídeos

Oito dos nove vídeos têm áudio ambiente; o da Etapa 3 · Ponto 6 é silêncio. Decisão D3: mantido, baixo (`ambientVolume` 0,15) por baixo da narração.

### g. Final do vídeo da Etapa 2 · Ponto 2

A partir de uns 40 s, o operador aparece na frente da câmera. Isso não é visível, porque a narração termina aos 14,7 s. Opcionalmente, a versão derivada pode ser cortada para economizar banda.

---

## 9. Arquitetura

### Stack
- **Vite + TypeScript + React + Three.js** (sem React Three Fiber). O React cuida só da UI: tela inicial, controles, pop-ups, debug e tela final.
- O **Three.js fica isolado em classes TypeScript comuns** (`PanoramaRenderer`, `VideoController`…), montadas por um único componente React (`ViewerCanvas`). O React nunca re-renderiza por causa de frames ou do `currentTime`.
- Estado da UI numa store mínima própria (`createStore` + `useSyncExternalStore`), sem Redux nem Zustand.
- Testes com **Vitest**.

### Estrutura

```
D:\Git\Geologar2\                      ← raiz do repositório (branch feature/geologar-360-web)
├── 4 - novos 360\  Narracao\  Roteiro…pdf  AUDITORIA_360.md     (fontes originais, intactas)
├── media\ lib\ index.htm …            (export 3DVista herdado da main, preservado)
└── app\
    ├── media-sources.json             mapa id lógico → arquivo fonte original
    ├── scripts\build-media.mjs        ffmpeg: gera as variantes + manifest.json
    ├── public\media\                  ← mídia DERIVADA (vídeos em LFS)
    │   ├── manifest.json
    │   ├── panoramas\  video\  audio\
    ├── src\
    │   ├── config\appConfig.ts        mediaBaseUrl, fades, perfis, flags
    │   ├── types\tour.ts              modelo de dados do tour
    │   ├── tour\scenes.ts             ← O ROTEIRO (única fonte da sequência)
    │   ├── tour\sceneRules.ts         regras puras de término de cena (canAutoAdvance…)
    │   ├── tour\TourEngine.ts         orquestração: start, goTo, next, prev, pause, restart
    │   ├── tour\tourStore.ts          estado de baixa frequência para a UI
    │   ├── media\AudioBus.ts          AudioContext: master, narração, ambiente por elemento
    │   ├── media\NarrationController.ts
    │   ├── media\VideoController.ts   pool de 2 <video> + VideoTexture, sequência de clips
    │   ├── media\MediaResolver.ts     id lógico + perfil → URL
    │   ├── media\AssetPreloader.ts    imagens (GPU) e narrações (blob): atual + próxima
    │   ├── viewer\PanoramaRenderer.ts esfera, fade, initialView, XR
    │   ├── viewer\InputControls.ts    pointer (mouse/touch), pinch, roda, teclado
    │   └── ui\…                       StartScreen, TourControls, PopupLayer, EndScreen, ErrorPanel, DebugPanel
    └── tests\                         motor, regras e validação do roteiro
```

### Modelo de dados (`types/tour.ts`)

```ts
interface VideoClip {
  id: string;
  src: string;              // id lógico: "video/e3-p1-1"
  required: boolean;        // precisa ser exibido inteiro ao menos uma vez
  ambientVolume?: number;   // sobrescreve o volume da cena
}

interface VideoSceneMedia {
  type: "video";
  clips: VideoClip[];                       // tocados em ordem
  requireAllClipsOnce: boolean;             // todos os required inteiros antes do avanço automático
  loopWhileNarrating: boolean;              // acabou a sequência e a narração continua → recomeça
  finishCurrentClipAfterNarration: boolean; // narração acabou → espera o clip atual terminar
  loopMinNarrationRemaining?: number;       // ver A3
  ambientVolume: number;                    // 0.15 por padrão
}

interface ImageSceneMedia { type: "image"; src: string }   // "panoramas/e0-intro"

interface TourScene {
  id: string; title: string; stage: string;
  media: ImageSceneMedia | VideoSceneMedia;
  narration?: string;                       // "audio/e3-p1"
  initialView: { yaw: number; pitch: number; fov: number };
  next: string | null;
  autoAdvance: boolean;
  onEnd?: "advance" | "credits";
  sync?: { narrationStartAt?: { clip: number; time: number } };  // sincronização semântica
  cues: Cue[]; hotspots: Hotspot[]; overlays: Overlay[];
}
```

- **Caminhos lógicos:** `scenes.ts` usa ids como `video/e3-p1-1`, sem extensão, sem perfil e sem URL absoluta. O `MediaResolver` traduz id + perfil em `mediaBaseUrl + arquivo`, usando o `manifest.json`.
- **Sincronização semântica:** fica nos dados da cena (`sync`). Por exemplo, `narrationStartAt: { clip: 0, time: 2.5 }` significa "a narração começa quando o clip 0 chegar a 2,5 s", medido no **tempo do vídeo** e por isso seguro com pause. Não há offsets dentro do player.
- **Cues e overlays** (pop-ups) são disparados pelo tempo da **narração** ou do vídeo. Estão vazios até chegarem os materiais (D5).

### Regra de término de cena (centralizada em `sceneRules.ts`)

```
Imagem:  narração acabou → avança

Vídeo:   narrationFinished
       ∧ requiredClipsDone      (todos os required exibidos inteiros, se requireAllClipsOnce)
       ∧ naturalExitPoint       (acabou um clip; ou finishCurrentClipAfterNarration = false)
       → avança
```

Eventos e decisões:

| Evento | Situação | Ação |
|---|---|---|
| narração `ended` | imagem | avança |
| narração `ended` | vídeo | `narrationFinished = true`, `exitRequested = true`. Avança já só se `finishCurrentClipAfterNarration = false` e os required estiverem feitos; senão espera o fim do clip atual |
| clip `ended` | há próximo clip | toca o próximo clip (sem fade, com micro-crossfade de áudio) |
| clip `ended` | último clip, narração acabou, required feitos | **avança** (fade → próxima cena) |
| clip `ended` | último clip, narração tocando, `loopWhileNarrating` | `videoCycle++` e recomeça do clip 0 (salvo o caso A3) |
| clip `ended` | último clip, narração tocando, sem loop | congela o último quadro e avança quando a narração acabar |

Não existe nenhum `if (scene.id === …)`: todo o comportamento vem da configuração da cena.

**Navegação manual** (próximo, voltar, escolher cena) **não espera** o vídeo. Ela para a narração e o vídeo, aborta os listeners, invalida o `sceneToken`, faz o fade e entra na cena pedida.

### Deploy multi-target

| Camada | Como |
|---|---|
| Base da aplicação | `base: './'` no Vite, com os assets relativos a `index.html`. Funciona em `localhost`, em `usuario.github.io/repositorio/` e num pacote local. |
| Origem da mídia | `VITE_MEDIA_BASE_URL`. O padrão é `./media/`, relativo ao app. Um servidor próprio ou CDN só troca essa variável. |
| Variantes | `manifest.json` com perfis por asset: `mobile`, `web` e `high` (reservado). O `MediaResolver` escolhe por capacidade do aparelho, com `?profile=` para forçar e fallback automático. |
| Autocontido | Nenhuma chamada obrigatória a CDN, API, banco, autenticação ou terceiros. Nem as fontes vêm de fora. |

Perfis gerados agora:

| Tipo | `mobile` | `web` | `high` |
|---|---|---|---|
| Vídeo | 2880 × 1440 · H.264 · ~8 Mbps | 4096 × 2048 · H.264 High · ~16 Mbps | (futuro: 5,7K HEVC) |
| Imagem | 4096 × 2048 JPEG | 4096 × 2048 JPEG | original 6528 × 3264 (cópia byte a byte) |
| Narração | MP3 original (cópia) | idem | idem |

Os vídeos mantêm a trilha de áudio ambiente (AAC), com `+faststart` e keyframe a cada 2 s.

**Git LFS:** guarda os `*.mp4` e `*.mov` (fontes e derivados). As imagens (≤ 2,6 MB), os MP3 (≤ 5 MB) e o PDF (23 MB) ficam no Git normal. O export 3DVista herdado (`media/**`) fica **fora** do filtro LFS para não aparecer como modificado.

---

## 10. Implementação por tema

### Áudio (`AudioBus` + `NarrationController`)
- Um **`AudioContext`** é desbloqueado no gesto "Iniciar experiência". O grafo tem um ganho master (volume/mute), um ganho de narração e um ganho de ambiente **por elemento de vídeo**.
  - Isso permite `ambientVolume` de verdade inclusive no iOS, onde `element.volume` é ignorado.
  - Também permite micro-crossfades sem clique (`linearRampToValueAtTime`).
- Um **único `<audio>` de narração**, reutilizado. O áudio da próxima cena é pré-carregado como Blob (`fetch` → `objectURL`), e é impossível haver duas narrações simultâneas.
- No gesto inicial, cada elemento de mídia (narração e os 2 vídeos) é "desbloqueado" com `play()` de um silêncio curto. É o procedimento padrão, sem contornar política de navegador.

### Vídeo (`VideoController`)
- Um **pool fixo de 2 elementos `<video>`** (A/B), cada um com sua `VideoTexture` e seu `MediaElementSource`, todos criados uma única vez.
- Enquanto o clip atual toca no elemento ativo, o elemento livre **pré-carrega o próximo clip da cena**. Quando o último clip da cena começa, o elemento livre passa a pré-carregar o **primeiro clip da próxima cena**.
- **Troca de clip** dentro da cena: o próximo elemento começa a tocar, a textura só é trocada quando o primeiro quadro está decodificado (`requestVideoFrameCallback`), e o ambiente faz um fade-out de ~150 ms no fim do clip anterior e um fade-in de ~150 ms no novo. Não há fade de imagem.
- O `ended` do vídeo **nunca** decide a cena sozinho: ele informa o motor, que consulta `sceneRules`.
- **Pause e play** sempre agem em conjunto sobre narração e vídeo.

### Estado
- **Store da UI** (baixa frequência): `phase`, cena atual e próxima, índice, status do panorama, da narração e do vídeo, `clipIndex`, `clipsCompleted`, `videoCycle`, `narrationFinished`, `exitRequested`, volume/mute, erro, preload e overlays ativos.
- **Alta frequência** (`currentTime` de áudio e vídeo) fica **dentro dos controladores**. O painel de debug consulta os controladores a 4 Hz, sem passar pela store.
- `phase`: `idle → loading → playing ⇄ paused → transitioning → … → credits → finished`, e também `error`.

### Race conditions
- Cada cena tem um `sceneToken` e um `AbortController`. Todo listener é registrado com `{ signal }`, e todo evento carrega o token. Um evento de token antigo é **ignorado e registrado no log**.
- `runtime.exiting` impede avanço duplo (por exemplo, narração e clip terminando no mesmo tick).
- Durante `transitioning`, pedidos automáticos são ignorados. Um pedido manual guarda só o último destino, aplicado ao fim da transição.

### Preload e memória
- **Imagens:** `fetch` → `createImageBitmap` → `renderer.initTexture()`, já na GPU antes da troca. Ficam no máximo 2 texturas de panorama (atual e próxima); as outras recebem `dispose()` e `bitmap.close()`.
- **Vídeo:** no máximo 2 elementos no total. Um elemento que sai de uso recebe `removeAttribute('src')` e `load()`, liberando o decoder.
- **Narração:** no máximo 2 Blobs (atual e próxima). Os outros são liberados com `revokeObjectURL`.

### Transição
- O fade é feito **no WebGL** (a cor do material da esfera vai a 0), e funciona igual em XR. Dura 450 ms para escurecer e 600 ms para clarear (configurável), sem relação com a duração do áudio.

### Erros
- **Panorama ou vídeo falhou:** painel com "Tentar novamente" e "Pular cena".
- **Narração falhou ou travou:** um watchdog detecta `currentTime` parado sem pausa e mostra "Tentar novamente" e "Continuar sem narração". O "Continuar" marca `narrationFinished` e a regra de término segue normalmente.
- **`next` inválido:** barrado pelo teste de validação do roteiro e recusado em tempo de execução.
- **Última cena:** créditos, depois conclusão, depois "Recomeçar".

### Mobile
- Pointer Events (mouse e touch unificados), pinch e roda para o FOV, e nenhuma dependência de hover.
- Safe areas, `100dvh`, alvos de toque de pelo menos 44 px, `pixelRatio` limitado a 2 e ajuste de FOV em portrait.

### Quest / WebXR (depois do fluxo web estável)
- `renderer.xr.enabled` e `setAnimationLoop` desde já. O `initialView.yaw` é aplicado girando a esfera, então vale igual no headset.
- O botão de VR fica atrás de uma flag até a etapa 14.

### Debug
- `?debug=1` ou `Shift+D`. Mostra cena, panorama, áudio (estado, tempo e duração), clip e ciclo, `narrationFinished` / `exitRequested`, próxima cena, preload, fase, token e perfil de mídia.
- Logs estruturados no console: `[tour] …`.

---

## 11. Testes obrigatórios do motor (Vitest, com controladores falsos)

1. Imagem + narração: a narração termina e a cena avança.
2. Vídeo maior que a narração: a narração termina, o vídeo continua, o vídeo termina e a cena avança.
3. Vídeo menor que a narração: o vídeo termina e faz loop, a narração termina, o ciclo atual termina e a cena avança.
4. Dois vídeos obrigatórios: `1-1` toca, a narração termina, `1-1` termina, `1-2` toca inteiro e a cena avança.
5. Pause: narração e vídeo pausam; resume: os dois continuam.
6. Avanço manual: não espera o vídeo, cancela a cena e entra na próxima.
7. Callback antigo: um evento atrasado da cena anterior tem token inválido e é ignorado.
8. Recomeçar: última cena → conclusão → recomeçar → primeira cena limpa.

Além disso: regras puras de `sceneRules` (inclusive A3) e validação do roteiro (ids únicos, `next` válidos, todas as cenas alcançáveis e todas as mídias presentes no manifest).

---

## 12. Plano de implementação

1. Git + Git LFS (branch `feature/geologar-360-web` a partir de `origin/main`).
2. Vite + React + TypeScript + Three.js em `app/`.
3. Tipos e `scenes.ts`.
4. Pipeline de mídia (`build-media.mjs` → variantes + `manifest.json`).
5. Viewer 360.
6. `VideoController`.
7. `NarrationController`.
8. `TourEngine`.
9. Lógica conjunta de vídeo e narração (`sceneRules`).
10. Preload.
11. Controles.
12. Final e "Recomeçar".
13. Build para GitHub Pages (depende de A1).
14. WebXR/Quest.

**Primeiro marco:** as 13 cenas rodando sozinhas do início ao fim, respeitando narração, vídeos inteiros, loops e sequência de clips.
