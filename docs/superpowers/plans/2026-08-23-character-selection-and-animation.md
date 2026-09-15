# Character Selection and Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir os dois personagens em uma seleção 3D inicial e iniciar a dungeon com o modelo escolhido, com animações corretas em ambos.

**Architecture:** Um catálogo tipado descreve os dois personagens, enquanto um repositório carrega e reutiliza seus GLB. Uma cena temporária de seleção usa o renderer existente; depois da confirmação, o `Game` troca para a cena principal e o `Player` cria uma instância independente do modelo escolhido.

**Tech Stack:** TypeScript, Three.js 0.161, Vite 5, Vitest, HTML e CSS.

**Spec:** `docs/superpowers/specs/2026-08-23-character-selection-and-animation-design.md`

## Global Constraints

- A escolha dura somente até a página ser atualizada.
- O mesmo canvas e `WebGLRenderer` atendem seleção e jogo.
- Somente o personagem escolhido entra na cena principal.
- O Dragon Miner usa fallback explícito do Paladino somente para clipes ausentes.
- Ataque, dano e morte têm precedência sobre locomoção.
- Não alterar inimigos, habilidades, inventário ou balanceamento.
- O diretório não possui `.git`; checkpoints verificados substituem etapas de commit.

## Design contract

- **Approval:** aprovado explicitamente pelo usuário em 23/08/2026 para arquitetura, visual e fluxo de falhas/testes.
- **Subject world:** tela de escolha de campeão para o dungeon crawler Dragon Miner, construída com pedra escura, musgo, cobre envelhecido e luz de fogo.
- **Audience:** jogador de ação isométrica em desktop ou dispositivo móvel.
- **Interface job:** selecionar um campeão jogável antes de entrar na dungeon.
- **Palette:** Basalto `#11130f` (fundo), Pedra `#292d25` (superfícies), Musgo `#606c38` (estado disponível), Cobre `#c08e3a` (seleção), Brasa `#c66b3d` (ação), Areia `#e8dcc7` (texto).
- **Typography:** Georgia como display humanista; Georgia/Times como corpo; Consolas como utilidade técnica e mensagens de erro.
- **Layout thesis:** os dois modelos são o centro da composição, sobre pedestais; título acima e controles abaixo nunca competem com as silhuetas.
- **Signature element:** o pedestal selecionado recebe um anel de cobre luminoso sincronizado com a aproximação suave do personagem.
- **Aesthetic risk:** textura mineral e iluminação assimétrica ocupam o fundo inteiro, evitando um modal genérico sem comprometer legibilidade.
- **Icon source/system:** N/A; a seleção usa texto e modelos 3D, sem ícones decorativos ou emoji.
- **Critique ledger:** cartões genéricos foram revisados para pedestais integrados à cena; gradientes vermelho/preto existentes ficam restritos ao loading; nomes e ações aprovados são mantidos; nenhum dado fictício será criado.
- **Responsive:** lado a lado acima de 720 px; composição compacta/alternável abaixo disso; sem rolagem horizontal.
- **States:** normal, hover, foco visível, selecionado, carregando e indisponível.
- **Keyboard:** `A`/`D` e setas alternam, `Enter` confirma, foco DOM permanece visível.
- **Reduced motion:** rotação, aproximação e transições param ou tornam-se instantâneas sob `prefers-reduced-motion: reduce`.
- **Roles:** roteamento de modelos não está disponível sem criar subagentes; agente principal assume separadamente `Sol Elevated: direction/review` e `Luna Very High or Sol Light: execution`.
- **Acceptance:** Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- **Acceptance:** Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.

---

### Task 1: Catálogo tipado e adaptação de clipes

**Files:**
- Create: `src/characters/CharacterCatalog.ts`
- Create: `src/characters/AnimationClipAdapter.ts`
- Create: `src/characters/AnimationClipAdapter.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `CharacterId`, `CharacterDefinition`, `CHARACTERS`, `getCharacterDefinition(id)`.
- Produces: `adaptRotationClip(clip, allowedNodeNames, newName)` e `makeClipInPlace(clip)`.

- [ ] **Step 1: Instalar Vitest e registrar `npm test`**

Executar `npm install --save-dev vitest` e adicionar `"test": "vitest run"` aos scripts.

- [ ] **Step 2: Escrever testes falhos do adaptador**

Criar casos com `THREE.VectorKeyframeTrack` e `THREE.QuaternionKeyframeTrack` que comprovem: somente `.quaternion` de ossos permitidos sobrevive em `adaptRotationClip`; o nome/duração são preservados; `makeClipInPlace` fixa X/Z da trilha `mixamorig:Hips.position` no primeiro quadro e preserva Y.

- [ ] **Step 3: Executar RED**

Run: `npm test -- src/characters/AnimationClipAdapter.test.ts`

Expected: FAIL porque os módulos/funções ainda não existem.

- [ ] **Step 4: Implementar catálogo e adaptadores mínimos**

O catálogo define `dragon-miner` e `paladin`, os caminhos aprovados e estes mapas exatos:

```ts
dragonMiner: { idle: 'idle', attacking: 'ataque' }
paladin: {
  idle: 'Parado', running: 'correndo', attacking: 'Corte_rapido',
  hit: 'hit', dead: 'morte'
}
```

`adaptRotationClip` clona apenas trilhas `node.quaternion` cujo `node` pertence a `allowedNodeNames`. `makeClipInPlace` clona todas as trilhas, mas neutraliza X/Z de `mixamorig:Hips.position`.

- [ ] **Step 5: Executar GREEN**

Run: `npm test -- src/characters/AnimationClipAdapter.test.ts`

Expected: PASS.

### Task 2: Repositório de assets e resolução de animações

**Files:**
- Create: `src/characters/CharacterAssetStore.ts`
- Create: `src/characters/CharacterAnimations.ts`
- Create: `src/characters/CharacterAnimations.test.ts`
- Modify: `src/utils/AnimationHelper.ts`

**Interfaces:**
- Consumes: `CharacterDefinition`, `adaptRotationClip`, `makeClipInPlace`.
- Produces: `CharacterAssetStore.loadAll(onProgress)`, `get(id)`, `has(id)`, `getError(id)`, `createModel(id)`.
- Produces: `resolveCharacterClips(id, assets): Partial<Record<PlayerState, AnimationClip>>`.

- [ ] **Step 1: Escrever testes falhos de resolução**

Usar clipes reais em memória com nomes literais e verificar que Paladino resolve `Parado/correndo/Corte_rapido/hit/morte`; Dragon Miner mantém `idle/ataque` próprios e recebe `correndo/hit/morte` adaptados do Paladino com nomes de estado estáveis.

- [ ] **Step 2: Executar RED**

Run: `npm test -- src/characters/CharacterAnimations.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar armazenamento e resolução**

Usar um `GLTFLoader` configurado com DRACO e Meshopt. `loadAll` usa resultados independentes para que um erro não invalide o outro. `createModel` usa `SkeletonUtils.clone` para criar esqueleto independente. A resolução recebe os assets carregados, usa nomes exatos e registra fallback apenas para o Dragon Miner.

- [ ] **Step 4: Executar GREEN e regressão**

Run: `npm test`

Expected: todos os testes PASS.

### Task 3: Estado de locomoção do Player

**Files:**
- Create: `src/entities/PlayerLocomotion.ts`
- Create: `src/entities/PlayerLocomotion.test.ts`
- Modify: `src/entities/Player.ts`

**Interfaces:**
- Produces: `resolveLocomotionState({ keyboardMoving, hasMoveTarget, hasAttackTarget, isSwinging, isDead })`.
- `Player` passa a receber `CharacterId` e `CharacterAssetStore` no construtor.
- `Player.setKeyboardMoving(active)` informa a entrada contínua do frame.

- [ ] **Step 1: Escrever teste falho do bug observado**

Cobrir: teclado ativo retorna `running`; teclado solto sem destinos retorna `idle`; destino de clique retorna `running`; ataque/dano/morte mantêm precedência no `Player`.

- [ ] **Step 2: Executar RED**

Run: `npm test -- src/entities/PlayerLocomotion.test.ts`

Expected: FAIL por função ausente.

- [ ] **Step 3: Implementar lógica mínima e refatorar Player**

Remover o caminho fixo do modelo e o mapa manual único. O `Player.load()` obtém clone e clipes resolvidos do store. Em cada frame, o teclado informa movimento antes de `update`; `update` não desfaz `running` enquanto `keyboardMoving` estiver ativo.

- [ ] **Step 4: Executar GREEN**

Run: `npm test`

Expected: todos os testes PASS.

### Task 4: Seleção 3D acessível

**Files:**
- Create: `src/ui/CharacterSelectScreen.ts`
- Create: `src/ui/CharacterSelectionState.ts`
- Create: `src/ui/CharacterSelectionState.test.ts`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/HUD.ts`

**Interfaces:**
- Consumes: `CharacterAssetStore`, `CHARACTERS`, renderer e preferência de movimento reduzido.
- Produces: `CharacterSelectScreen.select(): Promise<CharacterId>` e `dispose()`.

- [ ] **Step 1: Escrever testes falhos do estado da seleção**

Verificar seleção inicial nula, clique que escolhe ID disponível, tentativa ignorada em opção indisponível, alternância A/D ou setas pulando indisponíveis e confirmação que exige escolha válida.

- [ ] **Step 2: Executar RED**

Run: `npm test -- src/ui/CharacterSelectionState.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar estado e tela**

Adicionar overlay com título, dois botões/cartões e botão `ENTRAR NA DUNGEON`. Criar cena de prévia, câmera, pedestais, luzes e clones dos modelos; aplicar `idle`, rotação suave, raycast no modelo, destaque dourado e enquadramento selecionado. Remover listeners e cancelar RAF em `dispose()`.

- [ ] **Step 4: Implementar CSS fiel ao contrato**

Usar somente os tokens Organic definidos no contrato, foco `:focus-visible`, breakpoints móveis e `@media (prefers-reduced-motion: reduce)`. Remover emoji do retrato do HUD ou substituí-lo por texto/forma nativa sem fingir iconografia.

- [ ] **Step 5: Executar GREEN**

Run: `npm test`

Expected: todos os testes PASS.

### Task 5: Orquestração do Game e verificação integral

**Files:**
- Modify: `src/core/Game.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/HUD.ts`

**Interfaces:**
- Consumes: `CharacterAssetStore`, `CharacterSelectScreen`, `Player(characterId, assets)`.
- Produces: fluxo `selecting -> loading -> playing` dentro de `Game.start()`.

- [ ] **Step 1: Integrar estados de inicialização**

Carregar os dois assets com progresso, ocultar loading quando houver ao menos uma opção, aguardar `select()`, reexibir loading, criar o `Player` escolhido, adicionar cenário/HUD e iniciar o loop somente em `playing`.

- [ ] **Step 2: Corrigir o teclado no loop**

Chamar `player.setKeyboardMoving(this.keyboardDir.lengthSq() > 0)` em todos os frames, inclusive ao soltar teclas, antes de `player.update(delta)`.

- [ ] **Step 3: Executar testes e build**

Run: `npm test`

Expected: todos os testes PASS.

Run: `npm run build`

Expected: build concluído sem erros TypeScript/Vite; o aviso conhecido de chunk acima de 500 kB pode permanecer.

- [ ] **Step 4: Validar visualmente em desktop e mobile**

Iniciar Vite, capturar e inspecionar a seleção em aproximadamente 1440×900 e 390×844, escolher cada personagem em execuções separadas e validar `idle`, `running`, ataque, dano e morte.

- [ ] **Step 5: Validar teclado e movimento reduzido**

Percorrer toda a seleção com teclado sem mouse; verificar foco e confirmação. Emular ativamente `prefers-reduced-motion: reduce`, confirmar que rotação/aproximação/transições são removidas e repetir a inspeção de overflow.

- [ ] **Step 6: Encerrar o servidor temporário e revisar escopo**

Parar o Vite usado na inspeção, confirmar que não houve alterações em inimigos, habilidades, inventário ou balanceamento e registrar quaisquer avisos residuais.
