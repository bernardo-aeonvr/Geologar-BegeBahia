# Pop-ups ausentes — Geologar 2

Os conteúdos abaixo estão previstos no roteiro (`Roteiro_Geologar_Bege_Bahia_Revisado.pdf`), mas os arquivos ainda não foram entregues em
`H:\Shared drives\Drive Geral AeonVR\0020-Geologar\Assets\Geologar 2\Popups`.

Os quatro primeiros já estão **reservados** em `app/src/tour/popups.ts`, com tempo, posição e id de mídia definidos e marcados com `pending`. Enquanto o arquivo não existe, aquele intervalo simplesmente não mostra nada: não há placeholder e a experiência não quebra.

**Para ativar um asset quando chegar:**
1. copie o arquivo para `Popups (Geologar 2)/`;
2. adicione a linha correspondente em `app/media-sources.json`;
3. rode `npm run media` em `app/`;
4. remova o campo `pending` da entrada em `app/src/tour/popups.ts`.

Os testes avisam se um asset reservado chegou e o `pending` ficou esquecido, e também o contrário.

---

## Etapa 1 — Ponto 2 (Parte de cima da pedreira)
**Esperado:** "Calcrete × Bege Bahia" (comparação visual).

**Status:** asset não encontrado. Intervalo reservado.

**Trecho do roteiro:** "Imagens complementares: Calcrete x Bege Bahia" / "Apresentar as imagens como comparação visual simples, sem interação."

**Narração:** "Ele é um calcrete, uma rocha sedimentar formada em ambiente continental." → **4,1 s – 12,0 s**. Logo depois começa a sequência das fotomicrografias.

**Arquivo sugerido:** `popup_calcrete_x_bege_bahia.png` → id `popups/g2-calcrete-x-bege`.

**Posição reservada:** yaw 32°, pitch 15°, largura 42°.

## Etapa 2 — Ponto 2 (Corte do bloco)
**Esperado:** "Comparação visual entre fio helicoidal e fio diamantado".

**Status:** asset não encontrado. Intervalo reservado. O roteiro marca este item como opcional: "caso haja material suficientemente claro".

**Trecho do roteiro:** "Comparação visual entre fio helicoidal e fio diamantado, caso haja material suficientemente claro."

**Narração:** "…reduziu perdas, aumentou o aproveitamento dos blocos e transformou a mineração local." → **9,4 s – fim**, logo após a animação do corte e no mesmo lugar dela.

**Arquivo sugerido:** `popup_fio_helicoidal_x_diamantado.png` → id `popups/g2-fio-helicoidal-x-diamantado`.

**Posição reservada:** yaw −30°, pitch 12°, largura 42°.

## Etapa 3 — Ponto 6 (Politriz automática)
**Esperado:** "Aplicação de compósito produzido com resíduos do Bege Bahia".

**Status:** asset não encontrado. Intervalo reservado.

**Trecho do roteiro:** "Imagem complementar: Aplicação de compósito produzido com resíduos do Bege Bahia, caso o cliente forneça material adequado."

**Narração:** "Durante o corte e o polimento também é gerado um pó fino… polipropileno… mobiliário urbano, mobiliário escolar e infraestrutura." → **16,4 s – fim**. Ocupa o mesmo lugar do popup "Politrizes automáticas", que some aos 16,2 s.

**Arquivo sugerido:** `popup_composto_residuo_bege_bahia.png` → id `popups/g2-composito-residuo`.

**Posição reservada:** yaw −42°, pitch 16°, largura 42°.

## Etapa 5 — Ponto 1 (Vista final): créditos e logos — **resolvido**
Os logos (GeoLogar, Museu Geológico da Bahia, ExpoGeo Virtual e CNPq) foram extraídos do vídeo de encerramento da experiência antiga (`Assets/Vídeo/T_encerramento.mp4`, copiado em `Creditos/`) por `app/scripts/credits-from-video.py`, que gera um cartão branco por logo. Eles aparecem em sequência na Etapa 5, logo depois das aplicações (ver `POPUPS_IMPLEMENTATION.md`).

**Pendente:** os logos de MGB, ExpoGeo e CNPq vieram de um vídeo 1080p (cerca de 700–850 px de largura). Arquivos vetoriais ou PNG originais dariam mais nitidez; para usá-los, troque as fontes no script.

## Etapa 4 — Ponto 1 (Reaproveitamento): "outros produtos"
**Esperado:** "Outros produtos feitos a partir do reaproveitamento", além de ladrilhos, placas e moledos.

**Status:** asset não encontrado. Ladrilho, placas e moledo já são mostrados pelo popup `produtos`. A narração não cita "outros produtos", por isso **não há intervalo reservado**. Se chegar material, ele pode virar uma sequência no lugar do popup atual.

## Etapa 5 — Ponto 1: aplicações em **cozinhas**
**Esperado:** o roteiro lista aplicações em "cozinhas, pisos, paredes, fachadas, ambientes internos".

**Status:** as 4 imagens entregues cobrem fachada e revestimento externo, ambientes internos (quarto e banheiro), piscina e área de lazer, e área externa. **Não há imagem de cozinha.** Para incluir uma, adicione um 5º slide à sequência `aplicacoes` e redistribua os tempos (ver `POPUPS_IMPLEMENTATION.md`).

---

## Arquivos entregues, mas não usados
| Arquivo | Motivo |
|---|---|
| `Arrumar/ChatGPT Image Oct 8, 2026, 10_51_45 AM-1.png` … `…_48 AM-4.png` (4) | Rascunhos das fotomicrografias com selos "IMAGEM 03–06", sem transparência (fundo preto). A pasta indica que ainda estão em ajuste. As versões finais (`3_…01`, `4_…02`, `6_…03`, `6_…04`) foram as usadas. |
| `8_comparacao_agua.png` | Idêntico, byte a byte, ao popup de água que já estava no tour (`popups/e3-p3-agua`). Já está em uso. |

## Ajuste de arte sugerido
- ~~`1_Salvador to Ourolândia_ 406 km.png` sem transparência~~ **resolvido no app**: é usada uma versão derivada com alpha correto (ver `POPUPS_IMPLEMENTATION.md`). Uma exportação com transparência vinda da arte continua sendo bem-vinda.
- O nome `6_Fotomicrografia_do_Bege_Bahia_03.png` tem o prefixo duplicado (deveria ser `5_`). A ordem usada segue o sufixo `_01…_04`.
