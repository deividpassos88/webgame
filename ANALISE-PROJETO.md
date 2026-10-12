# Análise do Projeto — Dragon Miner (webgame)

Documento gerado a partir da leitura completa do repositório, da suíte de testes e
dos dois builds de produção (público e ADM). Data da revisão: 12/10/2026.

---

## 1. Visão geral

Dragon Miner é um **dungeon crawler 3D em WebGL/Three.js**, em português (pt-BR),
single-player, com lobby de preparação e combate em waves até um boss final.
Não há servidor de jogo: tudo roda no cliente e o progresso é salvo em
`localStorage`.

| Item | Valor |
| --- | --- |
| Arquivos TypeScript | 387 (`src/**/*.ts`) |
| Linhas de código (sem testes) | **46.845** |
| Linhas de testes | **24.793** |
| Arquivos de teste | 200 |
| Testes | **1.306**, 100% verdes |
| Dependências de runtime | apenas `three` |
| Assets em `public/` | 289 arquivos, **187 MB** |
| Build de produção (`dist/`) | **190 MB** |
| Stack | Vite 5 · TypeScript strict · Vitest 4 (happy-dom) |

## 2. Fluxo do jogo

```
class-select  →  lobby (prévia 3D)  →  loading  →  waves 1..6  →  boss final  →  vitória  →  lobby
                        │
                        └── Oficina em tela cheia · MODO ADM (build ADM) · treino sem monstros
```

O fluxo é dirigido por `src/core/GameFlowController.ts` (máquina de estados:
`lobby → loading-game → in-game → victory`) e orquestrado por `src/core/Game.ts`
(3.497 linhas), que monta cena, câmera, HUD, waves, VFX, inventário e o painel ADM.

## 3. Arquitetura por domínio

| Pasta | Responsabilidade | Destaques |
| --- | --- | --- |
| `core/` | Orquestração, câmera, input, fluxo, performance | `Game`, `CameraController`, `InputManager`, `FramePerformanceMonitor` |
| `characters/` | Guerreiro em runtime + assets GLB | `RuntimeWarrior*` (geometria, skinning, materiais, arma, budget) |
| `combat/` | Dano, combos, skills, status elemental, fadiga | `WarriorSkillCatalog`, `SkillComboController`, `ElementalStatus`, `FatigueMeter` |
| `entities/` | Player, inimigos, boss, baús, bonecos de treino | `Player`, `Enemy`, `Boss`, `BossSkillController`, `RewardChest` |
| `waves/` | Waves, spawn, dificuldade, registries | `WaveManager` (6 waves + `final-battle` com barras de HP) |
| `vfx/` | Efeitos por skill e por classe | `VFXPool`, `WaterDragonVFX` (Draco das Marés), `IceCrystalWaveVFX`, `LaserVFX` |
| `ui/` | Lobby, HUD, oficina, inventário, telas | `LobbyScreen` (2,1 mil linhas), `BlacksmithScreen`, `HUD` |
| `inventory/` `equipment/` `crafting/` `rewards/` | Itens, equipamento, forja e recompensas | 5 peças forjáveis, expansão de mochila, baús |
| `profile/` | Perfil, atributos, hotkeys, progressão | `PlayerProfile` persistido em `localStorage` |
| `admin/` | Ferramentas de administrador | ver seção 5 |
| `world/` `effects/` `utils/` | Cenário, iluminação, projéteis, logging | `Level`, `ProximityLighting`, `Logger` |

Padrões consistentes: cada módulo tem contrato/teste próprio
(`*.test.ts` ao lado do código), regras puras isoladas de Three.js e comentários
em português explicando decisões de produto.

## 4. Sistemas em jogo

- **Classes:** Guerreiro (`paladin`) e Maga (`mage`), com armas iniciais próprias
  (Espada do Recruta / Cajado Arcano) e conjuntos distintos de skills e VFX.
- **Combate:** ataque básico com área, combo encadeado, empoderamento/imunidade de
  combo, status elemental, medidor de fadiga, dano por distância e projéteis.
- **Skills:** catálogo por classe com custo de energia, cooldown e efeitos visuais
  exclusivos por skill (`SkillVisualBindings`) — Mage usa feitiços water/ice/
  lightning/laser/lava, Guerreiro usa slashes, tornado e mergulho.
- **Waves e boss:** 6 waves com escalonamento por dificuldade e multiplicador de
  equipamento, mini-boss, boss final com múltiplas barras de HP e skills próprias.
  O Dragonic Overlord alterna três skills — círculo, retângulo e chuva de 30
  meteoros — com dano/alcance em `BOSS_SKILL_DAMAGE` e `BOSS_SKILL_GEOMETRY`
  (ver 7.7).
- **Itens:** catálogo com raridade, bônus de conjunto, aprimoramento, destruição,
  equipar/desequipar sem duplicar, mochila com capacidade expansível (Token de Guilda).
- **Oficina:** craft de 5 peças do conjunto comum com materiais, apresentação 3D do
  ferreiro (idle/working/delivery) e entrega do item na mochila.
- **Lobby:** prévia 3D do personagem com arrasto/keyboard, abas Herói/Inventário/
  Skills/Oficina, status, hotkeys e busca/filtro de mochila.
- **Qualidade de vida:** hotkeys configuráveis, ataque básico automático, painel de
  teste de animação (modo ADM) e cache de build (`ClientCache`).

## 5. Sistema administrativo (ADM)

O menu ADM é um painel flutuante (`AdminPanel`) arrastável, recolhível (F2) e com
controle de opacidade. Comandos disponíveis:

| Comando | Efeito |
| --- | --- |
| `Wave 1..6` | Pula direto para a wave escolhida |
| `Ir para o Boss` | Abre a batalha final |
| `Hitkill Boss` | Mata o boss instantaneamente (habilitado só com boss vivo) |
| `Imortalidade` | Jogador imune a dano |
| `Câmera ADM` | Câmera livre de administrador |
| `Adicionar monstro / mini-boss / boss` | Spawn de treino |
| `Limpar monstros` | Remove os spawns de treino |
| `Adicionar item` | Injeta itens do catálogo na mochila, com rollback se falhar o save |

O painel abre recolhido como um botão flutuante **ADM** no canto inferior direito
(`z-index: 10050`), arrastável, recolhível por **F2** e com controle de opacidade.
Os comandos de combate (waves, boss, spawn, toggles) nascem **desabilitados** e só
são liberados quando a partida começa (`setGameplayAvailable`); "Adicionar item"
funciona desde o lobby.

Além do painel, o lobby expõe o botão **MODO ADM**, que inicia uma partida de treino
sem monstros e com skills livres. Toda autorização passa por `AdminCommandGate`,
`AdminGameActions` e `resolveAdminEnabled` (ver seção 7).

## 6. Build e publicação

| Comando | Modo | ADM | Pasta |
| --- | --- | --- | --- |
| `npm run dev` | development | ligado | servidor Vite em `0.0.0.0:5173` |
| `npm run build` | production | **desligado** | `dist/` |
| `npm run build:admin` | admin | **ligado** | `dist/` |
| `npm run preview:admin` | admin | ligado | serve o `dist/` em `0.0.0.0:5173` |

Resultado do build ADM atual (`npm run build:admin`):

```
dist/index.html                  23,70 kB │ gzip   6,18 kB
dist/assets/index-*.css         206,97 kB │ gzip  40,41 kB
dist/assets/Game-*.css            8,77 kB │ gzip   2,57 kB
dist/assets/index-*.js           45,84 kB │ gzip  11,98 kB
dist/assets/Game-*.js         1.314,72 kB │ gzip 351,50 kB   (Three.js + jogo)
```

Aviso de chunk >500 kB é esperado: o `Game` carrega Three.js por `import()`
dinâmico depois do bootstrap, então o primeiro paint não espera o bundle grande.

## 7. Achados, correções e riscos

### 7.1 Corrigido: botão “Iniciar partida” travado sem aviso

`applyStartButtonState()` desabilitava de verdade (`disabled`) o botão quando não
havia arma equipada. Um botão `disabled` não dispara clique, então
`showStartWeaponNotice()` — o aviso central “Equipe sua arma antes de iniciar a
partida.” — **nunca aparecia**. O teste
`LobbyScreen.test.ts > blocks Iniciar partida…` falhava desde antes de 02/10/2026
(registrado em `docs/superpowers/specs/2026-10-02-…-design.md` como falha conhecida).

Correção: o gate da arma passou a manter o botão **clicável** (aparência travada via
`.is-weapon-locked`, estado em `aria-disabled` + `title`, aviso no clique), enquanto a
Oficina em tela cheia continua desabilitando o botão de fato. O gate agora usa a
mesma regra do jogo (`getPrimaryWeaponId`, que considera `primaryWeapon` e `weapon`).

### 7.2 Corrigido: ADM ligado também no build público

`main.ts` ligava o ADM em **qualquer** build sem `?admin=0` — ou seja, o bundle
público de produção publicava Hitkill, Imortalidade e injeção de itens para todos,
contradizendo o `BUILD-ADMIN.md`. A decisão virou a função testável
`resolveAdminEnabled({ adminParam, mode, viteAdminMode, development })`:

| Build | ADM |
| --- | --- |
| `npm run build` (production) | desligado (mesmo com `?admin=1`) |
| `npm run build:admin` (`--mode admin`) | ligado |
| `npm run dev` | ligado |
| `.env.admin` (`VITE_ADMIN_MODE=true`) | ligado |
| `?admin=0` / `?admin=false` / `VITE_ADMIN_MODE=false` | desligado sempre |

Verificado nos bundles: build ADM compila `mode:"admin",viteAdminMode:"true"`; build
público compila `mode:"production",viteAdminMode:void 0`.

### 7.3 Aberto: ~125 MB de arquivos que o jogo não usa

Dos 289 arquivos em `public/` (188 MB), **180 não são citados** por nenhum código
(116 referências de asset no total). Os maiores:

| Grupo | Tamanho | Observação |
| --- | --- | --- |
| `*.blend` / `*.blend1` (mini boss, ferreiro) | **50 MB** | fontes Blender, não usadas pelo navegador |
| pacotes de referência visual (`reference-redesign`, `reference-match`, `user-pack`, `exact`, `ui/lobby/*.png`) | **63 MB** | imagens de estudo/layout, não ligadas a nenhuma tela |
| `models/cenario3.glb` | 11 MB | nenhum código carrega |
| modelos antigos (`monstro.glb`, `mini boss A.glb`) | ~1 MB | substituídos pelos de `Monstros/fase 1-1` |

Limpar isso reduz o deploy de **190 MB para ~65 MB** sem tocar em nenhum asset em uso
(a varredura marca `monster_arch.glb`/`monstro_*.glb` só por causa do caminho
codificado `fase%201-1`, esses **estão** em uso).

### 7.4 Resolvido: menu de Configurações do lobby

A engrenagem do lobby não tinha handler. Agora ela (e o botão **AJUSTES** da doca do
HUD) abrem um painel com qualidade gráfica, contador de FPS, números de dano e
sensibilidade do giro da prévia, salvos no perfil (schema 12). Detalhes em
`MENU-CONFIGURACOES.md`.

### 7.5 Resolvido: nome da arma inicial contradizia o lobby

O mesmo item (`starter-sword`) aparecia com **dois nomes diferentes** na mesma tela
de lobby: o rodapé mostrava `initialWeaponLabel` do `CharacterCatalog`
("Espada do Recruta", em pt-BR) enquanto a mochila, o tooltip e o painel ADM usavam
`InventoryCatalog` — que trazia `label: 'Sword Novice'`. O nome em inglês era o único
rótulo de item fora do padrão pt-BR do catálogo (o do Maga já era "Cajado Arcano").

Correção: `InventoryCatalog['starter-sword'].label` passou a ser `'Espada do Recruta'`,
com um comentário apontando a obrigação de os dois catálogos concordarem. Três
fixtures de teste que fixavam o texto antigo foram atualizadas
(`InventoryCatalog.test.ts`, `LobbyScreen.test.ts`, `RpgUiViewModel.test.ts`); o
`CraftRewardsPresentation.test.ts` passou a usar "Cajado Arcano", que exercita a mesma
regra (nome sem tier preservado) sem depender desse item.

### 7.6 Aberto: documentação defasada

- `ARQUIVOS-UTILIZADOS.md` / `LIMPEZA-RESUMO.md` falam de um projeto com 52 assets e
  123 MB; hoje são 289 arquivos e 187 MB. Os documentos anteriores também usam
  acentuação inconsistente (`CODEX_HANDOFF.md` sem acentos).
- As métricas desta seção 1 foram reconferidas em 12/10/2026 contra o repositório:
  os números antigos (355 arquivos, 42.995 linhas, 1.196 testes) já estavam defasados.

### 7.7 Balanceamento do boss final (12/10/2026)

Ajustes pedidos pelo design, todos em valores nomeados para não haver número solto:

| Item | Antes | Agora |
| --- | --- | --- |
| Dano do meteoro | 9 | **18** (dobro) |
| Alcance do meteoro (`meteorRadius`) | 1,35 m | **2,7 m** (dobro) |
| Dano do círculo | 23 | **46** (dobro) |
| Aviso do círculo (`circle`) | 4,2 s | **3,5 s** (explode mais rápido) |
| Dano do retângulo | 24 | **48** (dobro; mantém 120 × 24 m) |
| Vida total do boss | 7000 | **5600** (−20%) |
| Vida dos lacaios da batalha final | ×1 | **×2** |

Decisões:

- **O meteoro quase nunca acertava.** 30 círculos de 1,35 m sobre um disco avisado
  de 18 m cobriam só ~17% da área. Um teste novo (`BossSkillController.test.ts`)
  mede a cobertura em grade e trava a regressão: hoje passa de 45%.
- **As 5 barras continuam existindo.** O corte de 20% foi feito em
  `BOSS_BASE_HP` (1400 → 1120), ou seja, no tamanho de *cada* barra; `maxHP`
  segue sendo `base × 5`. A HUD e `resolveBossBarLayer` não souberam da mudança.
- **O dobro de vida vale só para os lacaios da batalha final**, aplicado em
  `spawnFinalBattle` sobre o multiplicador do pedido; as waves normais seguem a
  escala por wave/equipamento intacta.

#### Pose-T ao soltar o meteoro (corrigido)

O clipe `attack_meteors` é usado em dois lugares: na skill de meteoros **e** como
metade do rodízio de garras corpo a corpo (`playNextAttack`). Quando os dois
coincidiam, `activate()` chamava `fadeOut()` e `fadeIn()` na **mesma** ação; o
`fadeOut` cancelava o `fadeIn` e o peso ia a **0** — bind pose, o "boss em pose-T".

Correção: `activate()` só faz `fadeOut` no clipe anterior quando ele é diferente
do próximo. O teste `BossAnimationController.test.ts` reproduz o defeito (peso 0)
e passa a exigir peso 1 — falhava antes da correção.

### 7.8 Observações menores

- `Game.ts` com 3.853 linhas é o maior ponto de acoplamento; mudanças de combate
  costumam exigir leitura extensa. Já há extrações (políticas, controllers), então é
  uma dívida sob controle, não um bloqueio.
- 43 arquivos de “debug/inspect” em `scripts-inspect/` e `scripts/` ficam no
  repositório, mas não entram no bundle.
- O aviso de chunk >500 kB pode ser silenciado com
  `build.chunkSizeWarningLimit` ou resolvido com `manualChunks` (Three.js separado).

### 7.9 Bugs relatados no boss final (corrigidos em 12/10/2026)

Dois defeitos observados em partida real, ambos com causa raiz encontrada e coberta
por teste de regressão.

**1. A marcação vermelha às vezes ficava no chão depois do impacto.** O
`updateBossSkills()` só chegava em `bossEffects.update(delta)` na **última** linha do
método, depois das decisões de IA. Quando o boss entrava no modo `follow` (jogador
colado nele) logo depois de um impacto, o `return` antecipado de
`shouldUpdateBossSkills(mode)` pulava o envelhecimento do efeito e o decalque/explosão
congelava na cena. Correção: `bossEffects.update(delta)` passou a ser a **primeira**
coisa do método (roda em todo quadro, em qualquer modo) e a chamada duplicada do fim
foi removida. Aproveitando, quando `shouldClearBossTelegraph(mode, activeCast)` cancela
um aviso, o código agora faz `bossSkills.reset()` **e** `bossEffects.clear()` — antes o
aviso cancelado deixava a pintura vermelha prometendo uma explosão que nunca vinha.

**2. O boss ficava azul de gelo até morrer.** Não era o congelamento que não
restaurava — um repro direto de `applyMageFreeze` mostrou a restauração correta. O
problema era uma **corrida entre o flash de dano e a tinta de gelo**: ao começar o
flash, `hitFlashBaseColors` guardava `material.emissive` *corrente*; se o boss estava
congelado (azul `0x2a7fff`), esse azul era guardado como "cor de repouso" e reescrito
quando o flash terminava — muito depois de o gelo ter acabado. Correção: um novo mapa
`hitFlashBaseEmissives` guarda o emissivo canônico por material **uma única vez**, na
criação do material, e é ele que o flash devolve; `applyFreezeTint()` também passou a
preferir o valor canônico (`hitFlashBaseEmissives` → `hitFlashBaseColors` → valor
corrente), de modo que nenhum dos dois sistemas consegue transformar a tinta do outro
em permanente.

Evidência (antes → depois, um material do corpo do boss):

```
repouso           { color: 9048080, emissive: 3605251, ei: 1 }
congelado         { color: 10199740, emissive: 2785279, ei: 1 }   // 0x2a7fff
após o flash, código antigo   { color: 9048080, emissive: 2785279, ei: 1 }  // azul preso
após o flash, código novo     { color: 9048080, emissive: 3605251, ei: 1 }  // original
```

Testes novos: `src/entities/EnemyFreezeVisuals.test.ts` (4 casos: gelo expira e devolve
a aparência; flash sobrevivendo ao gelo não deixa azul; três ciclos de gelo + dano não
acumulam tinta; morte do inimigo congelado tira o azul) — **2 dos 4 falham** se a
correção for revertida. `src/effects/BossSkillEffects.test.ts` ganhou 3 casos
(o aviso só libera quando o tempo avança e `clear()` apaga os avisos de círculo e
retângulo) e `src/core/GameFinalBossContract.test.ts` um caso que trava o contrato do
fonte: exatamente **um** `bossEffects.update(delta)` em `updateBossSkills`, antes do
`if (!shouldUpdateBossSkills(mode))`, e o desvio de cancelamento com
`bossSkills.reset()` + `bossEffects.clear()`.

## 8. Verificação executada (12/10/2026)

```
npm run typecheck     → limpo
npm test              → 200 arquivos · 1.306 testes · 0 falhas (~58 s)
npm run build         → dist/ público, sem ADM (mode:"production", viteAdminMode:void 0)
npm run build:admin   → dist/ com ADM (mode:"admin", viteAdminMode:"true")
npm run preview:admin → serve dist/ em 0.0.0.0:5173
```

### 8.1 Fumaça de navegador do build ADM (`tools/smoke-admin.mjs`)

O build ADM foi exercitado de ponta a ponta num Chromium headless, contra o
`dist/` servido pelo `vite preview` — 20/20 verificações, sem erro de console:

```
OK  jogo sobe com canvas                              OK  Imortalidade ligada (toggle responde)
OK  painel ADM montado no boot                        OK  monstro de treino spawnado
OK  tela de seleção de classe presente                OK  Adicionar item responde na mochila
OK  lobby aberto após escolher classe                 OK  salto de wave não quebra a página
OK  botão MODO ADM liberado no lobby                  OK  F2 recolhe/expande o painel
OK  gate de arma barra o início antes de equipar      OK  sem erros de console / exceções
OK  mochila mostra o nome da arma em pt-BR
OK  arma equipada pelo menu da mochila                → partida de treino: 6 waves + Ir para o
OK  MODO ADM ligado                                   Boss + Imortalidade + Câmera ADM + 3 spawns
                                                      habilitados só depois de entrar em jogo
```

Uso (as dependências de navegador não entram no `package.json`; o Chromium vem
dentro do `@sparticuz/chromium`, como no `tools/smoke-boot.mjs`):

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm i --no-save puppeteer @sparticuz/chromium
npm run build:admin && npm run preview:admin &
npm run smoke:admin -- http://127.0.0.1:5173/
```

Os screenshots das quatro etapas (lobby, mochila, painel ADM em jogo e pós-comandos)
ficam em `artifacts/` (gitignored) para inspeção visual.

Há também `tools/verify-boss.mjs`, que pula direto para a batalha final pelo painel
ADM e observa as skills do Dragonic Overlord por N segundos, conferindo a HUD de 5
barras (rótulo `5x` e cor verde no início), se cada skill dispara e aterra, e se o
player parado perde vida. Última execução: **7/7 verificações**, com
`meteors: aviso` e `meteors: impacto` no log e o HP do player caindo de 100% para 22%
(reexecutado depois das correções desta seção).

```bash
node tools/verify-boss.mjs http://127.0.0.1:5173/ 80
```

### 8.2 Confirmações de regressão importantes

- **ADM não vaza para o build público**: o bundle público compila
  `mode:"production",viteAdminMode:void 0` e não contém `mode:"admin"`. As strings de
  UI do painel permanecem no chunk (dead code que o Rollup não elimina sozinho), mas
  ficam inalcançáveis atrás do gate `resolveAdminEnabled`.
- **Gate de arma do lobby**: antes de equipar, o botão aparece travado
  (`.is-weapon-locked`, `aria-disabled="true"`) mas segue clicável e o aviso central
  "Equipe sua arma antes de iniciar a partida." aparece — confirmado no navegador. O
  aviso se auto-oculta em 4 s, o que pode dar a impressão de que o clique não fez nada
  se a tela for observada só depois disso.

### 8.3 Varredura de assets e documentação

- Varredura própria de `public/`: **121 arquivos (63,8 MB) referenciados** e
  **168 arquivos (123,4 MB) sem nenhuma referência** em `src/`, `index.html`,
  `tools/` ou `scripts-inspect/` — confirma a seção 7.3.
- `ANALISE-PROJETO.md` teve as métricas da seção 1 e os números do build atualizados,
  a numeração das subseções corrigida (havia dois "7.6") e este bloco de verificação
  reescrito.

Arquivos alterados neste ciclo: `src/core/Game.ts`, `src/entities/Enemy.ts`,
`src/core/GameFinalBossContract.test.ts`, `src/effects/BossSkillEffects.test.ts`,
`src/entities/EnemyFreezeVisuals.test.ts` (novo) e `ANALISE-PROJETO.md`.
