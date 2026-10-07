# Análise do Projeto — Dragon Miner (webgame)

Documento gerado a partir da leitura completa do repositório, da suíte de testes e
dos dois builds de produção (público e ADM). Data: 07/10/2026.

---

## 1. Visão geral

Dragon Miner é um **dungeon crawler 3D em WebGL/Three.js**, em português (pt-BR),
single-player, com lobby de preparação e combate em waves até um boss final.
Não há servidor de jogo: tudo roda no cliente e o progresso é salvo em
`localStorage`.

| Item | Valor |
| --- | --- |
| Arquivos TypeScript | 355 (`src/**/*.ts`) |
| Linhas de código (sem testes) | **42.995** |
| Linhas de testes | **22.147** |
| Arquivos de teste | 180 |
| Testes | **1.196**, 100% verdes |
| Dependências de runtime | apenas `three` |
| Assets em `public/` | 289 arquivos, **188 MB** |
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

Resultado do build ADM atual:

```
dist/index.html                  24,25 kB │ gzip   6,35 kB
dist/assets/index-*.css         196,11 kB │ gzip  38,34 kB
dist/assets/Game-*.css            8,77 kB │ gzip   2,57 kB
dist/assets/index-*.js           43,54 kB │ gzip  11,33 kB
dist/assets/Game-*.js         1.254,88 kB │ gzip 335,35 kB   (Three.js + jogo)
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

### 7.5 Aberto: documentação defasada

- `BUILD-ADMIN.md` descrevia o `main.ts` antigo (já atualizado nesta entrega).
- `ARQUIVOS-UTILIZADOS.md` / `LIMPEZA-RESUMO.md` falam de um projeto com 52 assets e
  123 MB; hoje são 289 arquivos e 188 MB. Os documentos anteriores também usam
  acentuação inconsistente (`CODEX_HANDOFF.md` sem acentos).

### 7.6 Observações menores

- `Game.ts` com 3.497 linhas é o maior ponto de acoplamento; mudanças de combate
  costumam exigir leitura extensa. Já há extrações (políticas, controllers), então é
  uma dívida sob controle, não um bloqueio.
- 43 arquivos de “debug/inspect” em `scripts-inspect/` e `scripts/` ficam no
  repositório, mas não entram no bundle.
- O aviso de chunk >500 kB pode ser silenciado com
  `build.chunkSizeWarningLimit` ou resolvido com `manualChunks` (Three.js separado).

## 8. Verificação desta entrega

```
npm run typecheck     → limpo
npm test              → 183 arquivos · 1.223 testes · 0 falhas (~44 s)
npm run build         → dist/ público sem ADM
npm run build:admin   → dist/ com ADM (servido em http://localhost:5173)
```

Mudanças de código deste ciclo: `src/admin/AdminAccess.ts` (+ teste), `src/main.ts`,
`src/ui/LobbyScreen.ts` (+ teste), `src/profile/PlayerSettings.ts` (+ teste),
`src/profile/PlayerProfile.ts` (schema 12 + teste de migração), `src/ui/SettingsPanel.ts`
(+ teste), `src/ui/FpsBadge.ts` (+ teste), `src/ui/SettingsMenuContract.test.ts`,
`src/core/Game.ts`, `src/styles/settings-panel.css`, `index.html`.
