# Arena Celeste — Especificação cirúrgica

Reconstrução Three.js das duas referências de arena suspensa (imagens 1 e 2).
Este documento é o briefing que cada agente recebe e o checklist que o
orquestrador usa no veredito final. Nada aqui é "aproximado": cada medida sai
da leitura das imagens (1254 × 1254 px) e vira constante nomeada no código.

Referências copiadas para o lab (e versionadas) em
`public/arena-celeste/refs/`:

| Arquivo | Papel |
| --- | --- |
| `ref-1-frontal.png` | Composição frontal: piso, medalhão, arquibancadas laterais, ilha-templo central, céu |
| `ref-2-perspectiva.png` | Perspectiva de canto: plinto dourado, gema azul, bandeiras, colunata e multidão à direita |

---

## 1. Leitura da imagem (o que precisa existir)

Ordem de profundidade, do observador para o horizonte:

1. **Piso** de mármore branco-lavanda polido, 4 × 4 lajotas, juntas finas escuras.
2. **Marchetaria dourada**: moldura retangular interna, medalhão central com dois
   anéis, emblema de losango e quatro braços cardeais que terminam em losangos.
3. **Curb** dourado na borda, plintos de canto em mármore + ouro com **gema azul**.
4. **Bandeiras** azuis com borda e emblema dourados, penduradas na face externa da
   laje (frente, laterais e fundo) e nos pilares.
5. **Brasseiros**: colunas de mármore com capitéis, taça dourada e chama acesa.
6. **Arquibancadas** laterais: colunata, entablamento dourado, balaústre, multidão
   em silhueta e bandeiras entre colunas.
7. **Ilhas suspensas**: templos gregos, cachoeiras, árvores, rocha com musgo.
8. **Céu**: azul saturado no topo, cúmulos volumosos, sol quente e névoa de
   horizonte; mar de nuvens abaixo da arena.
9. **Cidade/torre distante** à direita e ilha-templo colossal ao fundo.

---

## 2. Medidas extraídas (px → metros)

Escala adotada: arena de **50 m** de lado (mesma área jogável do `Level` atual,
para não alterar spawns, waves nem o boss em `z = -18`).

| Elemento | Leitura na imagem | Medida no código |
| --- | --- | --- |
| Lado do piso | enquadra ~1000 px na borda distante | `50 m` (`ARENA.size`) |
| Lajotas | 4 × 4 | `TILE_COUNT = 4` → `12,5 m` cada |
| Moldura dourada | ~1/12 do lado para dentro | `BORDER_INSET = 4,6` → moldura em `±20,4 m` |
| Medalhão (anel externo) | diâmetro ≈ 0,50 da largura | raio `5,95 m` |
| Anel interno | ≈ 0,80 do externo | raio `4,72 m` |
| Linha de acento | ≈ 0,87 do interno | raio `4,12 m` |
| Losango central | ≈ 0,25 do anel externo | `2,9 m` de diagonal maior |
| Braço cardeal | do anel à moldura | comprimento `14,45 m`, largura `1,24 m` |
| Gema azul de canto | ≈ 1,8 m da moldura | centro `(±18,3; ±18,3)` |
| Plinto de canto | ≈ 2,4 m de aresta | centro `(±23,1; ±23,1)`, altura `0,82 m` |
| Curb | fita contínua na borda | altura `0,28 m`, largura `0,55 m` |
| Laje | face branca sob o ouro | espessura `1,15 m` |
| Bandeira da arena | ≈ 3,9 × 1,7 m + ponta | `3,9 m`, ponta `0,55 m` |
| Bandeira de pilar | mais estreita e longa | `4,6 × 1,35 m` |
| Brasseiro | ~8 m até a taça | `8,2 m`, base `1,2 m` |
| Arquibancada | 4 filas + colunata | base `x = ±28..39`, altura `9,2 m` |
| Colunas da arquibancada | passo ≈ 7 m | `7 m`, altura `7,8 m` |
| Multidão | 4 filas em degrau | `4 × ~66` por lado |
| Ilha-templo principal | ~220 px a ~150 m | templo `26 × 14 m` a `150 m` |
| Ilha colossal | ~30% da altura do céu | templo `60 × 30 m` a `260 m` |
| Céu | gradiente + cúmulos | dome `r = 800`, nuvens `250–700 m` |
| Mar de nuvens | abaixo da arena | plano `y = -45` |

---

## 3. Paleta (amostrada nas imagens)

| Uso | HEX |
| --- | --- |
| Mármore claro | `#e7e4e2` |
| Mármore sombra | `#b9b5bd` |
| Junta / veio | `#8e8a95` |
| Ouro médio | `#d2a445` |
| Ouro claro | `#ffe7a3` |
| Ouro sombra | `#7c5714` |
| Azul esmalte | `#1d3f9e` |
| Azul bandeira | `#22509f` |
| Safira | `#2f6bff` |
| Calcário (arquibancada) | `#d6cfc2` |
| Rocha | `#8b8378` |
| Musgo / árvore | `#6d7f4d` |
| Céu topo | `#3f8fd8` |
| Céu horizonte | `#dcecf7` |
| Nuvem luz | `#fdfeff` |
| Nuvem sombra | `#c9d6e6` |
| Sol | `#fff2dd` |
| Multidão | `#23252c` |

---

## 4. Briefing por agente

### Agente A — Piso e marchetaria (`CelestialFloor`)
- Textura procedural 2048², 4 × 4 lajotas, veios finos, juntas de 3 px, variação
  sutil por lajota. `roughness ≈ 0,32`, `envMapIntensity ≈ 0,8`.
- Moldura dourada de perfil biselado (`0,55 × 0,06 m`) em `±20,4 m`, com filete
  de mármore claro por fora.
- Medalhão: dois anéis dourados com toro de borda (não apenas `RingGeometry`
  chapado), linha de acento fina, emblema em 4 camadas (ouro → marfim → ouro →
  pequeno losango).
- Braços: placa de marfim biselada + nervura dourada central, ponta em losango na
  moldura. Nada de z-fighting: cada camada sobe `0,012–0,05 m`.
- Losangos de junta nos cruzamentos da moldura e gema azul de canto.
- Critério: a 30 m a leitura é "mármore com desenho dourado", não "adesivos".

### Agente B — Laje, curb, fundação e plintos (`CelestialSlab`)
- Laje de mármore com face externa em blocos, cornija dourada de `0,35 m` e
  moldura inferior; canto com plinto escalonado + tampa dourada + esmalte azul +
  emblema de losango (igual ref 2).
- Rocha irregular sob a laje (vértices deslocados por ruído determinístico), com
  tufos de vegetação — a arena precisa "flutuar".
- Curb perimetral com topo dourado; nenhum obstáculo dentro da área jogável.

### Agente C — Bandeiras (`CelestialBanners`)
- Geometria própria com ondulação por seno, ponta triangular inferior, mastro
  dourado e sombreamento de tecido na textura.
- Emblema: losango vazado + losango interno + haste vertical, em ouro sobre azul.
- Distribuição simétrica: 4 na frente, 3 no fundo, 3 em cada lateral, 1 por
  brasseiro, 6 por arquibancada.
- `DoubleSide`, sem sombra projetada (custo), leve balanço no `update`.

### Agente D — Brasseiros e arquibancadas (`CelestialTribunes`)
- Brasseiros de `8,2 m`: base quadrada, fuste canelado, capitel dourado, taça em
  lathe, chama com duas camadas (núcleo + sprite aditivo) e flicker.
- Arquibancada: embasamento rochoso, terraço, balaústre dourado, 4 degraus de
  multidão, colunata de `7,8 m`, entablamento com faixas douradas, cobertura e
  bandeiras entre colunas.
- Multidão em `InstancedMesh` (uma draw call por lado), silhuetas escuras com
  variação de altura/cor; sem rostos (a distância não pede).
- A estrutura não pode invadir os spawns (`|x| ≤ 23,5`).

### Agente E — Céu, ilhas e água (`CelestialSky`)
- Dome com shader de gradiente (topo azul → horizonte claro) + disco solar e
  halo; `fog: false` no material.
- Nuvens: sprites de textura procedural com iluminação pintada (topo quente,
  base fria), anel a `250–700 m`, mais mar de nuvens em `y = -45`.
- Ilhas: rocha deslocada por ruído + topo de grama; templo grego (estilóbato,
  colunas, entablamento, frontão); cachoeiras em planos aditivos animados com
  névoa na base; árvores em instâncias.
- Ilha colossal e cidade distante para dar a profundidade da ref 1.
- Luz: sol direcional quente `(-55, 65, 35)`, hemisférica céu/solo e ambiente
  baixo; `scene.environment` gerado por PMREM do próprio céu (reflexo dourado).
- Exposição ACES `≈ 1,0`; bloom suave só no laboratório (toggle).

### Agente F — Integração no jogo (`Game`)
- `CelestialArena` implementa a mesma API pública de `Level` (`group`,
  `groundMeshes`, `navigationObstacles`, `update`, `getBossSpawnPoint`,
  `getEnemySpawnPoints`, `getWaveSpawnPoints`, `getFinalBattleSpawnLayout`,
  `getFinalBattleMinionSpawnPoints`).
- `Game` troca o cenário por uma linha; `GameLightingRig` ganha o estilo
  `celestial` sem alterar o comportamento `dungeon` coberto por testes.
- Nada de assets externos: 100% procedural (determinístico, zero download).

### Agente G — QA / Orquestrador (`tools/capture-arena.mjs`)
- Duas câmeras calibradas para reproduzir o enquadramento das refs:
  - **Câmera 1**: `(0; 7,0; 45)` → alvo `(0; 1,0; -8)`, FOV `42°`.
  - **Câmera 2**: `(-40; 11,0; 40)` → alvo `(0; 0,5; -5)`, FOV `55°`.
- Captura em `1254 × 1254`, HUD escondida (`?ui=0`), comparação lado a lado com
  a referência e checklist de 24 itens.
- Reprova qualquer item visível: medalhão errado, bandeira faltando, sombra
  ausente no piso, céu chapado, multidão vazia, plinto sem gema, etc.

---

## 5. Critérios de aceitação (checklist do orquestrador)

| # | Item | Tolerância |
| --- | --- | --- |
| 1 | Piso 4 × 4 com juntas legíveis | 4 lajotas por eixo |
| 2 | Moldura dourada fechada e simétrica | desvio ≤ 0,02 m |
| 3 | Medalhão com 2 anéis + acento | 3 círculos concêntricos |
| 4 | Emblema central em losango | 4 camadas |
| 5 | 4 braços cardeais alinhados aos eixos | rotação 0°/90°/180°/270° |
| 6 | Losango de ouro na ponta de cada braço | 4 |
| 7 | Gema azul nos 4 cantos | 4 |
| 8 | Plinto de canto com tampa dourada + esmalte | 4 |
| 9 | Curb dourado em todo o perímetro | contínuo |
| 10 | Bandeiras na frente/laterais/fundo | 4/3+3/3 |
| 11 | Emblema e barra dourada nas bandeiras | legível a 20 m |
| 12 | Brasseiros com chama acesa | 4 na arena + arquibancadas |
| 13 | Arquibancadas com colunata | 2 lados |
| 14 | Multidão em 4 filas por lado | ≥ 400 instâncias |
| 15 | Bandeiras entre colunas | ≥ 5 por lado |
| 16 | Ilha-templo com frontão | ≥ 1 |
| 17 | Cachoeira visível | ≥ 2 |
| 18 | Céu com gradiente + cúmulos | sem banding/chapado |
| 19 | Mar de nuvens abaixo | visível nos cantos |
| 20 | Sol quente + sombras suaves no piso | sombra dos brasseiros |
| 21 | Reflexo/realce dourado (env map) | ouro não "plástico" |
| 22 | Rocha e vegetação sob a laje | visível na ref 2 |
| 23 | Sem z-fighting no piso | 0 pixels piscando |
| 24 | 60 fps no jogo / ≥ 30 fps no lab | medido no HUD |

---

## 6. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Textura de mármore "chapada" | veios em 2 escalas + bump + env map |
| Ouro parecer plástico | metalness 1, roughness 0,25, mapa de pinceladas |
| Piso z-fighting | camadas com offsets explícitos e `polygonOffset` quando preciso |
| Céu lavado pelo tone mapping | exposição 1,0 e cores de céu em `SRGBColorSpace` |
| Custo de draw calls | merge por material + `InstancedMesh` para multidão/árvores |
| Regressão do jogo | API idêntica ao `Level`; testes existentes intactos |
| Headless sem GPU | SwiftShader (já usado pelo `smoke-admin`) |

---

## 7. Registro de execução e veredito

Preenchido na seção final deste documento após as capturas comparativas.

---

## 7. Execução e veredito do orquestrador

### 7.1 O que foi construído (100% procedural, zero assets baixados)

| Módulo | Arquivo | Conteúdo |
| --- | --- | --- |
| Medidas e paleta | `src/world/celestial/CelestialConfig.ts` | constantes da seção 2, posições de bandeiras/brasseiros/plintos, câmeras de QA |
| Texturas | `CelestialTextures.ts` | mármore 4×4 com veios em 2 escalas, ouro escovado, esmalte, calcário, rocha, musgo, bandeira com emblema, cúmulos, mar de nuvens, cachoeira, chama, halo e equirect do céu |
| Geometria | `CelestialGeometry.ts` | losangos/placas biseladas, bandeira com ondulação e ponta, rocha deslocada por ruído, coluna, taça de braseiro, cipreste; `MeshBatch` funde centenas de peças por material |
| Materiais | `CelestialMaterials.ts` | PBR: mármore com clearcoat, ouro metálico, esmalte, safira emissiva, tecido, pedra; `envMapIntensity` calibrado |
| Céu e ilhas | `CelestialSky.ts` | dome em shader, sol e halo, cúmulos em sprites, mar de nuvens, 8 ilhas suspensas com templo/rotunda, cachoeiras, cidade distante |
| Tribunas | `CelestialTribunes.ts` | embasamento, promenade, balaústre, 5 degraus, colunata dupla, entablamento, cobertura, multidão instanciada, rocha e vegetação |
| Arena | `CelestialArena.ts` | piso, laje, cornija com dentículos, plintos com estátua, moldura, medalhão, braços, gemas, bandeiras, brasseiros, fundação; API idêntica ao `Level` |
| Luz | `CelestialLighting.ts` | sol quente com sombra 2048, hemisférica, preenchimento frio |
| Integração | `src/core/Game.ts`, `GameLightingRig.ts`, `CameraController.ts` | cenário trocado por uma linha; estilo de luz `celestial`; enquadramento de jogo mais aberto |
| QA | `arena-celeste-lab.html`, `tools/capture-arena.mjs`, `tools/calibrate-arena-camera.mjs`, `tools/verify-arena-game.mjs` | laboratório com câmeras calibradas, sobreposição A/B, calibrador de câmera e verificação dentro do jogo |

### 7.2 Checklist do orquestrador (24 itens)

| # | Item | Resultado |
| --- | --- | --- |
| 1 | Piso 4 × 4 com juntas legíveis | ✅ |
| 2 | Moldura dourada fechada e simétrica | ✅ |
| 3 | Medalhão com 2 anéis + acento | ✅ |
| 4 | Emblema central em losango (4 camadas) | ✅ |
| 5 | 4 braços cardeais alinhados aos eixos | ✅ |
| 6 | Losango de ouro na ponta de cada braço | ✅ |
| 7 | Gema azul nos 4 cantos | ✅ |
| 8 | Plinto de canto com tampa dourada, esmalte e **estátua** | ✅ (estátua adicionada na revisão) |
| 9 | Curb dourado em todo o perímetro | ✅ |
| 10 | Bandeiras frente/laterais/fundo (4/3+3/3) | ✅ |
| 11 | Emblema e barra dourada nas bandeiras | ✅ |
| 12 | Brasseiros com chama acesa | ✅ (chama em sprite, sem “X” em ângulos rasos) |
| 13 | Arquibancadas com colunata | ✅ |
| 14 | Multidão em 4–5 filas por lado | ✅ (5 filas + público no corrimão, InstancedMesh) |
| 15 | Bandeiras entre colunas | ✅ |
| 16 | Ilha-templo com frontão | ✅ (templo + rotunda com cúpula) |
| 17 | Cachoeira visível | ✅ (duas por ilha grande) |
| 18 | Céu com gradiente + cúmulos | ✅ |
| 19 | Mar de nuvens abaixo | ✅ |
| 20 | Sol quente + sombras suaves no piso | ✅ |
| 21 | Reflexo/realce dourado (env map) | ✅ (PMREM do próprio céu) |
| 22 | Rocha e vegetação sob a laje | ✅ (bloco de pedra + rocha + arbustos) |
| 23 | Sem z-fighting no piso | ✅ (camadas com offsets + `polygonOffset` na ranhura) |
| 24 | Performance | ✅ 42–46 fps em **SwiftShader** (software, 1254²) no laboratório; ~161–232 draw calls |

### 7.3 Desvios conscientes (e por quê)

| Ponto | Referência | Implementação | Motivo |
| --- | --- | --- | --- |
| Convergência das tribunas | Tribunas em “V” no fundo | Tribunas paralelas às laterais | Com 50 m de lado, girar a tribuna empurrava a frente dela para dentro da área jogável (`|x| < 23,5`). O teste `mantém as tribunas fora da área de combate` trava isso. |
| Escala da multidão | ~1,6 m, muito densa | 1,3–1,5 m, 5 filas | Mantém a multidão atrás do balaústre, fora do alcance da câmera de jogo. |
| Fidelidade do mármore | Veios finos e quentes | Veios procedurais em 2 escalas | Textura 2048² gerada em runtime; sem assets externos (requisito do projeto). |
| Câmera de QA frontal | Composição da ref | `ref1` calibrada por projeção (`tools/calibrate-arena-camera.mjs`) | A ref usa lente ~50–60 mm de um ponto que não coincide com a câmera jogável. |
| Moldura do piso | Fio duplo + sombra interna | Ranhura escura + ouro + filete marfim | Lê igual a 20 m e não depende de sombra pintada. |

### 7.4 Verificação executada

```
npm run typecheck     → limpo
npm test              → 202 arquivos · 1.325 testes · 0 falhas
npm run build:admin   → dist/ com ADM (mode:"admin", viteAdminMode:"true")
node tools/capture-arena.mjs            → ref1, ref2 e overview, sem erros de console
node tools/verify-arena-game.mjs        → arena carregada no jogo, HUD e painel ADM OK
```

Capturas comparativas (referência à esquerda, reconstrução à direita):

- `docs/arena-celeste/qa/comparativo-ref1.png`
- `docs/arena-celeste/qa/comparativo-ref2.png`
- `docs/arena-celeste/qa/arena-ref1.png`, `arena-ref2.png`, `arena-overview.png`
- `artifacts/arena/game-arena-wave2.png` (arena em jogo, wave 2)

---

## 8. Revisão v2 — reconstrução após a reprovação da v1

A v1 foi reprovada ("não ficou igual à imagem"). A v2 refez a câmera, o piso e o
primeiro plano; o restante (tribunas, céu) segue em aberto.

### 8.1 O que mudou

| Área | Mudança |
| --- | --- |
| Câmera `ref1` | Recalibrada por mínimos quadrados sobre os 4 cantos do piso medidos na ref (`fl 89,851 · fr 1163,851 · bl 330,420 · br 925,420`): `(0, 37,86, 63,16) → (0, −4,09, 0)`, **fov 58°**, erro ≈ 0,02. O horizonte fica **acima do quadro** — a ref não tem linha de horizonte visível. |
| Piso | Textura `floor-albedo.png` re-retificada a partir do quadrilátero corrigido; medalhão ampliado para **r 10,0 / 7,95 / 6,95 m** (o raio de 10,0 casa com a elipse medida: 310 × 160 px). |
| Fachada | Gola dourada 1,8 → **1,3 m**; mármore 1,95 → 1,75 m; moldura 1,25 → 0,35 m; parede de pedra começa em **−3,5 m**; pilastras e corbelos passaram de ouro para **pedra**; pendente central refeito e esmalte no lugar da ranhura escura. |
| Bandeiras | 4 por face da laje (frente/fundo/laterais) em vez de 10 no total; largura 5 → **7 m**; suporte a `tip` por bandeira. |
| Tribunas | Reescritas: agora ficam **atrás das esquinas do fundo, de frente para a câmera** (`±42, −26`, giro 90°), com deck, balaustrada, banco de multidão, colunata, braseiros, bandeiras e saia de rocha. |
| Céu | Dome com **textura de gradiente** (o shader era lavado pelo tone mapping do lab); mar de nuvens rebaixado para fora do quadro alto; cúmulos reorganizados em três faixas. |
| Luz | Sol 3,2 → 2,35; hemisférica 0,52 → 0,66; ambiente 0,09 → 0,16; bloom 0,16/1,1 → 0,1/1,35. |

### 8.2 Medições da ref 1 (1254²) usadas no ajuste

- Aresta frontal do piso: **y 851–902**, x **89–1163** (largura 1074 px).
- Aresta do fundo: x **330–925** em **y 420**.
- Borda dourada contínua só na aresta frontal (y 858–870); no fundo o ouro aparece apenas nos topos dos plintos (y ≈ 408).
- Medalhão: caixa **471–781 × 486–667 px** (diâmetro 310 px).
- Céu: azul no topo (tom médio ≈ `#7fb0dd`), nuvens brancas em toda a faixa, ilhas `#c0c9d2`.

### 8.3 Pendências conhecidas (não atendidas nesta rodada)

1. **Tribunas** ainda lêem como "telhado azul" — a textura de multidão repete como
   telha e falta a multidão figurada em filas; a colunata e o entablamento têm
   volume, mas o conjunto não tem a densidade da ref.
2. **Céu** está azul, mas os cúmulos são "desenhados" (sprites redondos) e as
   ilhas não têm a escala/posição da ref; a ilha-templo grande ainda não aparece
   no enquadramento.
3. **Fachada** clara demais: a ref é cinza-azulada com sombras fortes; falta o
   relevo profundo dos painéis.
4. **Luz**: a ref tem sol rasante pela esquerda com sombras longas; a cena está
   mais plana (ambient/hemisférica altas para compensar a falta de AO).
5. Sem correspondência exata de **ornamentos** (balaústres torneados, capitéis,
   dentículos de ouro).

Veredito desta rodada: **composição e primeiro plano convergem** (câmera, piso,
medalhão, fachada e enquadramento), **tribunas e céu ainda divergem**. Não é
"exatamente igual" à referência.
