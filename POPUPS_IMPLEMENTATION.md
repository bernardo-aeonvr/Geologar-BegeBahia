# Popups Geologar 2

Popups visuais do roteiro `Roteiro_Geologar_Bege_Bahia_Revisado.pdf`, implementados na experiência 360 nova.
Assets de origem: `H:\Shared drives\Drive Geral AeonVR\0020-Geologar\Assets\Geologar 2\Popups`, copiados sem alteração para `Popups (Geologar 2)/`.
Assets ausentes: [`MISSING_POPUPS.md`](MISSING_POPUPS.md).

## Arquitetura

A implementação estende o sistema que já existia (overlays + cues no relógio da narração + painéis espaciais). Não há uma arquitetura paralela.

```
app/src/tour/popups.ts         ← CONFIGURAÇÃO ÚNICA: imagem, tempos, posição, escala, ordem
        │ popupsFor(cena) gera overlays + cues
        ▼
app/src/tour/scenes.ts          cada cena: ...popupsFor("<id>")
        ▼
TourEngine (relógio dos pop-ups, a cada 100 ms)
  lê narration.currentTime  →  sceneRules.evaluateOverlays()
                                 ├─ overlays ativos (janela de cada pop-up)
                                 └─ slide de cada sequência  (slideIndexAt)
  grava em store: activeOverlays + overlaySlides   (só quando algo muda)
        ▼
createTourApp  →  renderer.spatial.setActive(specs)    (url do slide atual; null se o asset faltar)
                  renderer.spatial.preload(specs)      (todas as imagens da cena atual + próxima)
        ▼
viewer/SpatialOverlays.ts
  1 pop-up = 1 painel preso ao panorama (yaw/pitch); slides trocam no MESMO painel com crossfade de 220 ms;
  vídeo: shader com chroma key, ressincronizado à narração a cada frame
```

**Princípios:**
- **A narração é a fonte de verdade.** O pop-up visível, e o slide dentro dele, é sempre uma função do tempo atual da narração: `tempo → intervalo → imagem`. Não existe `setTimeout` de sequência. Por isso pausa, seek, voltar, reiniciar a narração, perder o foco e atrasos de áudio não dessincronizam nada.
- **Mudança de ponto:** a store zera `activeOverlays` e `overlaySlides` na transição, os painéis da cena anterior saem com fade e as texturas que não serão mais usadas são liberadas. O relógio de cues de cada cena é cancelado junto com o `sceneToken`, então duas timelines não ficam ativas ao mesmo tempo.
- **Fim do tour / volta ao menu:** `viewer.clear()` limpa todos os painéis, texturas e vídeos.
- **Asset ausente:** o id não existe no manifest, então a url fica `null` e nada é exibido. Não há placeholder e o tour não quebra.
- **Falha de carregamento** (404 ou imagem corrompida): é registrada no console (`[spatial] asset-failed`), o painel some silenciosamente e o tour segue.
- **Pré-carregamento:** ao entrar numa cena, todas as imagens dos pop-ups da cena atual e da próxima são baixadas, decodificadas e enviadas à GPU (`renderer.initTexture`). Na troca de slide a textura já está pronta, sem piscar e sem quadro vazio.
- **Quest/VR e mobile:** os painéis são objetos 3D da cena. Aparecem igualmente em WebXR, no celular (retrato e paisagem) e no desktop, e não bloqueiam o arraste nem os controles.

## Relação roteiro → popup

| Etapa · Ponto | O roteiro pede | Implementação |
|---|---|---|
| Introdução | "Imagens complementares: Distância Salvador → Ourolândia" | popup isolado `salvador-ourolandia` |
| E1 · P1 | "pop-up: Travertino Romano × Bege Bahia, durante a comparação" | popup isolado `bege-x-travertino` |
| E1 · P2 | "Calcrete × Bege Bahia" | reservado (`calcrete-x-bege`, **asset ausente**) |
| E1 · P2 | "Imagem microscópica da textura" | **sequência** `fotomicrografias` (4 slides) |
| E2 · P1 | (fissuras, cavidades e heterogeneidades) | popup isolado `fissuras` (experiência original) |
| E2 · P2 | "Manter a animação que demonstra o corte do bloco" | **vídeo** `fio-cortando-pedra` (chroma key) |
| E2 · P2 | "fio helicoidal × fio diamantado, caso haja material" | reservado (`fio-helicoidal-x-diamantado`, **asset ausente**) |
| E3 · P3 | "Manter a comparação de consumo de água" | popup isolado `agua` (= `8_comparacao_agua.png`) |
| E3 · P4–P6 | (politrizes manual, semiautomática e automática) | popups isolados (experiência original) |
| E3 · P6 | "Aplicação de compósito… caso o cliente forneça" | reservado (`composito`, **asset ausente**) |
| E4 | "Ladrilhos · Placas · Moledos · Outros produtos" | popup isolado `produtos` (experiência original); "outros" ausentes |
| E5 | "Aplicações… em pequenos pop-ups durante a narração" | **sequência** `aplicacoes` (4 slides) |
| E5 | "Créditos e logos… pop-up reduzido" | infraestrutura pronta; **asset ausente** |

## Relação narração → popup

Os tempos foram medidos por **transcrição com timestamp de cada palavra** (faster-whisper) dos MP3 da pasta `Narracao/`, conferidos com o texto do roteiro.

| Cena (duração) | Trecho falado | Popup | Janela |
|---|---|---|---|
| Intro (39,97 s) | "Bem-vindo a uma jornada imersiva." → "…direto da cidade de Ourolândia, no coração do sertão baiano." | Salvador → Ourolândia | 17,1 s → fim |
| E1 · P1 (45,71 s) | "…o material lembrava o famoso travertino romano…" | Bege × Travertino | 35,5 s → fim |
| E1 · P2 (44,56 s) | "Ele é um calcrete, uma rocha sedimentar…" | Calcrete × Bege (ausente) | 4,1 → 12,0 s |
| E1 · P2 | "Ao longo de milhares de anos…" → "…textura brechoide." | Fotomicrografias (sequência) | 12,0 s → fim |
| E2 · P1 (31,45 s) | "Fissuras, cavidades…" → antes de "No passado…" | Fissuras | 9,0 → 19,8 s |
| E2 · P2 (14,68 s) | "O fio diamantado trouxe mais precisão…" | Animação do corte (vídeo 9,04 s) | 0,3 → 9,35 s |
| E2 · P2 | "…reduziu perdas, aumentou o aproveitamento…" | Helicoidal × diamantado (ausente) | 9,4 s → fim |
| E3 · P3 (31,40 s) | "…e a sustentabilidade também evoluiu…" | Água | 15,8 s → fim |
| E3 · P4 (27,56 s) | "A primeira é totalmente manual…" | Politrizes manuais | 0 s → fim (desde o começo, pedido do cliente) |
| E3 · P5 (15,23 s) | "…o processo é semiautomático…" | Politrizes semi-automáticas | 0 s → fim (desde o começo) |
| E3 · P6 (43,57 s) | "…totalmente automatizado…" | Politrizes automáticas | 0 → 16,2 s (desde o começo) |
| E3 · P6 | "Durante o corte… pó fino… polipropileno…" | Compósito (ausente) | 16,4 s → fim |
| E4 (29,78 s) | "…pode resultar em ladrilhos, placas… e moledos…" | Moledo / Placas / Ladrilho | 8,7 s → fim |
| E5 (43,49 s) | "Do sertão baiano para o mundo…" → antes de "Agora… observe ao seu redor" | Aplicações (sequência) | 0,3 → 27,8 s |

"→ fim" significa até o fim da cena, inclusive o tempo em que o vídeo 360 continua depois da narração.

## Popups isolados

| id | Arquivo de origem | Janela |
|---|---|---|
| `salvador-ourolandia` | `1_Salvador to Ourolândia_ 406 km.png` → versão derivada com alpha correto (`derivados/…_alpha.png`) | Intro 17,1 s → fim |
| `bege-x-travertino` | `2_BegeBahiaXTravertinoRomano.png` | E1 · P1 35,5 s → fim |
| `fio-cortando-pedra` | `7_fio_cortando_pedra.mp4` (vídeo 1920×1080, chroma key verde) | E2 · P2 0,3 → 9,35 s |
| `agua` | `8_comparacao_agua.png` (= `T_popup_…_Etapa3_ponto3_Vreduzida.png`) | E3 · P3 15,8 s → fim |
| `fissuras`, `politriz-*`, `produtos` | `Popups (experiencia original)/` | ver tabela acima |

**Vídeo sincronizado:** o tempo do vídeo é sempre `narration.currentTime − 0,3 s`. Se a diferença passar de 0,25 s, o vídeo é reposicionado. Ele pausa junto com o tour e, num seek, salta para o quadro certo. O fundo verde é removido no shader: chroma key em CbCr, calibrado no próprio vídeo (o fundo fica em d≈0, as bordas de transição ainda verdes vão até d≈0,40, e os pixels da pedra e do fio têm sempre d≥0,49), então a chave é transparente até 0,36 e opaca a partir de 0,48. Há também um despill: o verde de um pixel nunca passa do maior entre vermelho e azul, o que tira o halo sem afetar a pedra marrom. Só a região onde a animação acontece é exibida (x 23–81% do quadro, medida em todos os quadros), sem deformar.

## Sequência de fotomicrografias

Etapa 1 · Ponto 2: um único painel em yaw −32°, pitch 15°, largura 44°. Fonte das imagens: Santos et al., 2020.

| Slide | Arquivo | Início | Fim | Trecho da narração |
|------|---------|--------|-----|-----|
| 1 | `3_Fotomicrografia_do_Bege_Bahia_01.png` | 12,0 s | 21,5 s | "Ao longo de milhares de anos, águas ricas em cálcio circularam pelo solo do Vale do Rio Salitre." |
| 2 | `4_Fotomicrografia_do_Bege_Bahia_02.png` | 21,5 s | 31,5 s | "A evaporação intensa, o clima seco e as reações químicas deram origem a uma crosta rica em carbonato de cálcio." |
| 3 | `6_Fotomicrografia_do_Bege_Bahia_03.png` | 31,5 s | 39,0 s | "O resultado é uma rocha com cerca de 98% de carbonato, baixa sílica…" |
| 4 | `6_Fotomicrografia_do_Bege_Bahia_04.png` | 39,0 s | fim (44,56 s) | "…e uma estética única, marcada por tons suaves e **textura brechoide**." |

**Critério:** cada slide começa numa fronteira de frase da narração. O slide 4 ("Imagem microscópica do Bege Bahia", com clastos arredondados) coincide com "textura brechoide", a única correspondência semântica direta. Os slides 1 a 3 são painéis de fotomicrografia sem tema específico, então seguem a ordem dos arquivos, uma frase cada. A sequência começa aos 12,0 s porque o trecho anterior ("Ele é um calcrete…", 4,1–12,0 s) é a janela reservada da comparação Calcrete × Bege Bahia, também prevista no roteiro para este ponto.

## Sequência de aplicações do Bege Bahia

Etapa 5 · Ponto 1: um único painel em yaw 0°, pitch 14°, largura 42°.

**Créditos (Etapa 5 · Ponto 1):** sequência `creditos`, 27,8 s → fim da narração, no mesmo lugar das aplicações:

| Slide | Logo | Narração |
|---|---|---|
| 1 | GeoLogar (logo oficial) | 27,8 – 31,7 s |
| 2 | Museu Geológico da Bahia | 31,7 – 35,6 s |
| 3 | ExpoGeo Virtual | 35,6 – 39,5 s |
| 4 | CNPq | 39,5 s – fim |

Os cartões são gerados por `app/scripts/credits-from-video.py` a partir de `Creditos/T_encerramento.mp4`. Na experiência antiga, esse era um MP4 com chroma key.

| Slide | Arquivo | Início | Fim | Conteúdo |
|------|---------|--------|-----|-----|
| 1 | `9_Aplicacao_begeBahia (1).png` | 0,3 s | 7,2 s | Moledo — revestimento externo (fachada) |
| 2 | `9_Aplicacao_begeBahia (2).png` | 7,2 s | 14,1 s | Moledo — ambientes internos (quarto, banheiro) |
| 3 | `9_Aplicacao_begeBahia (3).png` | 14,1 s | 20,9 s | Placas — piscina e área de lazer |
| 4 | `9_Aplicacao_begeBahia (4).png` | 20,9 s | 27,8 s | Placas — área externa |

**Critério:** a narração da Etapa 5 não cita aplicações específicas, então os quatro slides têm duração igual (~6,9 s) entre "Do sertão baiano para o mundo" e o início de "Agora que você conhece essa história, **observe ao seu redor**". Nesse ponto o painel some, para a pessoa ver a paisagem final. A ordem segue a numeração dos arquivos (1 a 4), que também agrupa os materiais (moledo, depois placas). Nenhuma imagem mostra cozinha, que o roteiro também cita (ver `MISSING_POPUPS.md`).

## Posições

Escolhidas sobre os quadros de cada cena com uma grade de yaw/pitch, sempre **dentro ou perto do enquadramento inicial** (yaw ±45°) e **acima do horizonte** (pitch 8–16°), sem cobrir o assunto principal da cena:

| Popup | yaw | pitch | largura | Por quê |
|---|---|---|---|---|
| Salvador → Ourolândia | 30° | 14° | 40° | Céu à direita; o centro da cena é o campo de rocha da introdução |
| Bege × Travertino | 32° | 13° | 42° | Acima das casas à direita; a estrada fica livre no centro e o caminhão à esquerda |
| Calcrete × Bege (reservado) | 32° | 15° | 42° | Céu à direita, oposto às fotomicrografias |
| Fotomicrografias | −32° | 15° | 44° | Céu à esquerda; a cava da pedreira fica livre (mais largo para os detalhes) |
| Animação do corte | −32° | −11° | 48° | **No chão da pedreira, em primeiro plano**, como um bloco sendo cortado, à esquerda, sem tampar o operador que corta o bloco real ao fundo (+5° a +15°) (pedido do cliente) |
| Helicoidal × diamantado (reservado) | −30° | 12° | 42° | Céu à esquerda, logo depois da animação |
| Aplicações | 0° | 14° | 42° | Centralizado na vista inicial da cena final (pedido do cliente) |
| Créditos | 0° | 12° | 30° | Mesmo lugar das aplicações, logo depois delas; cartões brancos 3:2 |
| Água (tear multifio) | 133° | 6° | 28° | Ao lado do bloco, no vão entre ele e o tear multifio; a cena abre de frente para o tear (`initialView.yaw` 155°) (pedido do cliente) |
| (já existentes) Fissuras, Politrizes, Produtos | −42° a −32° | 8–16° | 42° | Ver `app/src/tour/popups.ts` |

**Referência da experiência antiga:** o export do 3DVista (`Geologar-BegeBahia` e `Assets/3dVista`, um `.vtp` proprietário) foi consultado só como referência de intenção. Os conteúdos novos não existiam lá, e os painéis antigos eram HUD de tela, não âncoras no 360. Nenhuma coordenada foi copiada.

## Assets ausentes

Ver [`MISSING_POPUPS.md`](MISSING_POPUPS.md): Calcrete × Bege Bahia, fio helicoidal × diamantado, compósito com resíduo, créditos e logos, "outros produtos" e aplicação em cozinha.

## Decisões tomadas

1. **Etapa 2 · Ponto 2 avança no fim da narração:** a pedido do cliente, a cena não espera o vídeo 360 de 42,6 s terminar (`finishCurrentClipAfterNarration: false`, `requireAllClipsOnce: false` em `scenes.ts`). A animação fica no chão, como um bloco sendo cortado.
1. **Animação do corte como vídeo com chroma key:** o roteiro pede "manter a animação". O arquivo entregue é um vídeo sobre fundo verde, e removê-lo em tempo real (shader) é o uso previsto desse tipo de asset. O arquivo original não é alterado. Toca uma passada inteira (9,04 s), alinhada a "O fio diamantado trouxe…", sem repetir para não terminar no meio de um corte.
2. **Alpha corrigido no `1_Salvador…` (pedido do cliente):** o PNG original veio sem transparência, com fundo preto fora do cartão arredondado (faixas laterais e cantos). O app usa uma versão derivada, `Popups (Geologar 2)/derivados/1_Salvador to Ourolândia_ 406 km_alpha.png`, gerada por `app/scripts/black-to-alpha.py`. O script faz um balde de tinta a partir das bordas (só o preto conectado à borda vira transparente; o interior escuro do cartão continua 100% opaco), aplica alpha gradual no antialias do contorno e recorta ao tamanho do cartão. O original não foi alterado. Se vier uma versão com transparência, aponte `media-sources.json` para ela.
3. **Arquivos de `Arrumar/` não usados:** são rascunhos (sem transparência, com selos "IMAGEM 03–06") das mesmas fotomicrografias que existem em versão final.
4. **Reservas para assets ausentes:** os intervalos e posições ficam definidos desde já. Quando o arquivo chegar, basta registrá-lo, sem refazer a implementação.
5. **Crossfade de 220 ms entre slides:** é curto e discreto, e a troca acontece no instante decidido pela narração (o fade não atrasa a sincronização).
6. **Relógio dos pop-ups a cada 100 ms** (antes era 250 ms): um seek mostra o slide certo em até 0,1 s.

## Como adicionar uma imagem posteriormente

1. Copie o arquivo original para `Popups (Geologar 2)/`, sem editar.
2. Em `app/media-sources.json`, adicione `"popups/<id>": { "kind": "overlay", "source": "Popups (Geologar 2)/<arquivo>" }`.
3. Em `app/`, rode `npm run media`. O arquivo é copiado para `public/media/popups/` e entra no `manifest.json`.
4. Em `app/src/tour/popups.ts`:
   - se o id já estava reservado (`pending`), apague o campo `pending`;
   - se for novo, adicione uma entrada `single` ou um slide numa `sequence`.
5. Rode `npm test`. Os testes conferem asset × manifest, tempos dentro da narração e se há sobreposição no mesmo lugar.

## Como alterar os tempos

Em `app/src/tour/popups.ts`:
- **popup isolado:** `start` e `end`, em segundos da narração da cena (sem `end`, vai até o fim da cena);
- **sequência:** `start` e `end` de cada slide; o `end` de um slide deve ser igual ao `start` do próximo (o teste verifica);
- **vídeo:** `start` (instante da narração que corresponde ao início do vídeo) e `end`.

Para conferir: abra `http://localhost:5173/?debug=1`, vá até a cena pelo menu e use o tempo de áudio do painel de debug.

## Como alterar posições

Em `app/src/tour/popups.ts`, edite `position: { yaw, pitch, width }`:
- `yaw`: 0 é o centro da imagem 360, positivo para a direita (−180 a 180);
- `pitch`: positivo para cima;
- `width`: largura do painel em graus (a altura segue a proporção da imagem);
- `roll` (opcional): inclinação do painel em graus.

Para achar o yaw de um objeto da cena: no modo debug, olhe para o objeto e leia `window.tour.renderer.controls.state.lon` no console. Esse valor é o yaw quando o `initialView.yaw` da cena é 0.
