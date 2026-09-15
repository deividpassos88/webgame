# Guerreiro procedural runtime Three.js — Plano de implementação

> **Para agentes de implementação:** execute as tarefas em ordem, com testes antes do código de produção. A entrega ativa é este plano; ela substitui a rota Blender/GLB para a aparência do jogador. Os arquivos Blender existentes permanecem como referência e não participam do runtime.

**Objetivo:** Substituir a malha visível do `paladin` por um guerreiro masculino atlético inteiramente gerado no navegador, conservar o rig e os clipes Mixamo atuais, gerar a espada sem GLB, e entregar movimento mais fluido com um combo de espada rápido de três golpes.

**Arquitetura:** `Guerreiro.glb` continua sendo carregado exclusivamente para `Skeleton`, ossos e animações. Depois da clonagem, uma fábrica determinística cria corpo, cabelo, roupas, armadura e bainha como `BufferGeometry`; as partes deformáveis recebem pesos calculados pela distância aos segmentos de osso e são vinculadas ao `Skeleton` existente. A fábrica só oculta as seis malhas do GLB depois de validar todas as malhas runtime. A espada é uma `Group` procedural usada pelo fluxo de recompensa atual, enquanto o machado e o baú permanecem carregados como ativos atuais. Um controlador puro de combo alimenta o `Player` sem alocar no `update()`.

**Stack:** TypeScript 5.4, Three.js 0.161, Vite 5, Vitest 4, WebGL desktop.

**Especificação aprovada:** `docs/superpowers/specs/2026-08-31-guerreiro-runtime-threejs-design.md`

## Limites globais

- O personagem runtime é o `paladin` atual: preservar seu clone, 65 ossos e os clipes `Idle`, `Running`, `AttackHorizontal`, `Reaction` e `Death`.
- `Guerreiro.glb` não pode ser removido nem deixar de ser carregado: ele é o fallback visual e a fonte de rig/animação.
- Nenhum novo GLB de personagem, armadura ou espada entra no caminho de execução. O baú e o machado podem continuar usando seus modelos atuais.
- Corpo e roupa deformáveis usam no máximo quatro influências normalizadas por vértice; itens rígidos são filhos de ossos.
- A versão final do guerreiro fica entre 14.000 e 18.000 triângulos, usa exatamente sete papéis de material PBR compartilhados e acrescenta no máximo oito draw calls.
- Não criar geometria, pesos, `Vector3`, arrays, materiais, meshes ou closures recorrentes no caminho por frame.
- Preservar a escolha inicial de arma: a espada runtime torna-se disponível no baú, e o machado continua opção alternativa. A bainha já é mostrada no personagem, mas a lâmina vai para a mão somente após a escolha.
- Cada estágio da espada dura `0.33 s`, `0.36 s` ou `0.40 s`; cada alvo recebe no máximo um dano por estágio. Não aplicar dano garantido no início ou no fim do golpe.
- Não inicializar Git: este workspace não é um repositório. Ao fim de cada tarefa, executar e registrar apenas as verificações indicadas.

## Estrutura final prevista

- `src/characters/RuntimeWarriorConfig.ts`: medidas, regiões anatômicas, papéis de material e orçamentos.
- `src/characters/RuntimeWarriorGeometry.ts`: primitivas paramétricas, partes corporais, roupa, armadura, bainha e espada.
- `src/characters/RuntimeWarriorSkinning.ts`: normalização de nomes de osso, mapa de rig, pesos por proximidade e validação.
- `src/characters/RuntimeWarriorMaterials.ts`: sete `MeshStandardMaterial` compartilhados com variação de shader leve.
- `src/characters/RuntimeWarriorFactory.ts`: montagem atômica, binding, fallback, métricas e descarte.
- `src/characters/RuntimeWarriorWeapon.ts`: `Group` da espada procedural destinada ao sistema de equipamento.
- `src/combat/SwordComboController.ts`: máquina de estado pura para o combo rápido.
- `src/entities/PlayerMovement.ts`: suavização determinística de velocidade.
- Testes co-localizados em `src/characters/`, `src/combat/`, `src/entities/` e `src/equipment/`.

## Task 1 — Criar o contrato de configuração e as primitivas geométricas determinísticas

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorConfig.ts`
- Criar: `src/characters/RuntimeWarriorGeometry.ts`
- Criar: `src/characters/RuntimeWarriorGeometry.test.ts`

**Interfaces:**

```ts
export type RuntimeMaterialRole =
  | 'skin' | 'eye' | 'hair' | 'cloth' | 'leather' | 'steel' | 'darkMetal';

export interface RuntimeWarriorPartGeometry {
  readonly id: string;
  readonly materialRole: RuntimeMaterialRole;
  readonly deformRegion: RuntimeDeformRegion | null;
  readonly geometry: THREE.BufferGeometry;
  readonly rigidBone: RuntimeRigBoneId | null;
}

export const RUNTIME_WARRIOR_BUDGET = {
  minTriangles: 14_000,
  maxTriangles: 18_000,
  maxDrawCalls: 8,
  maxInfluences: 4,
  minimumWeight: 0.001,
  materialRoles: 7,
} as const;

export function createRuntimeWarriorPartGeometries(
  measurements: RuntimeWarriorMeasurements
): RuntimeWarriorPartGeometry[];
```

- [ ] **Passo 1: escrever testes que falham para topologia e orçamento.**

```ts
it('creates the same finite indexed warrior topology from the same measurements', () => {
  const first = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);
  const second = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);
  expect(describeRuntimeParts(first)).toEqual(describeRuntimeParts(second));
  for (const part of first) {
    expect(part.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    expect(part.geometry.getIndex()).not.toBeNull();
  }
});

it('keeps body, clothing and armour within the WebGL triangle budget', () => {
  const parts = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);
  expect(runtimeTriangleCount(parts)).toBeGreaterThanOrEqual(RUNTIME_WARRIOR_BUDGET.minTriangles);
  expect(runtimeTriangleCount(parts)).toBeLessThanOrEqual(RUNTIME_WARRIOR_BUDGET.maxTriangles);
  expect(new Set(parts.map(part => part.materialRole)).size).toBe(7);
});
```

- [ ] **Passo 2: confirmar o teste vermelho.**

  Executar: `npm test -- src/characters/RuntimeWarriorGeometry.test.ts`

  Esperado: falha de importação, pois os módulos ainda não existem.

- [ ] **Passo 3: implementar uma malha de perfis em anéis sem dependência externa.**

  Implementar helpers privados para superfície de revolução e painel curvo: eles devem preencher `number[]` localmente durante o build e produzir `Float32BufferAttribute`, `Uint16BufferAttribute`, UV e normal uma única vez. Gerar, no espaço local do modelo: torso/abdômen/coxas/braços/panturrilhas/pés/mãos/cabeça/orelhas/nariz (pele), olhos, cabelo/barba, túnica/calça, cinto/braçadeiras/botas, couraça/ombreira/grevas e bainha. A espada não entra nesta lista: ela será usada pelo equipamento na Tarefa 5.

  Usar mais resolução em cabeça, mãos e junta de ombro, e menos resolução nas placas rígidas. Marcar cada parte com uma região deformável explícita (`head`, `torso`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`) ou com o osso rígido que a controla (`spine2`, `hips`, `leftFoot`, `rightFoot`). Calcular normais e bounding boxes antes de devolver as geometrias.

- [ ] **Passo 4: validar topologia, materiais e triângulos.**

  Executar: `npm test -- src/characters/RuntimeWarriorGeometry.test.ts && npm run typecheck`

  Esperado: aprovação; cada parte possui posição, normal, UV e índice válidos, e o total está entre 14k e 18k.

## Task 2 — Calcular pesos por proximidade aos ossos e validar o rig

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorSkinning.ts`
- Criar: `src/characters/RuntimeWarriorSkinning.test.ts`

**Interfaces:**

```ts
export type RuntimeRigBoneId =
  | 'hips' | 'spine' | 'spine1' | 'spine2' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftForeArm' | 'leftHand'
  | 'rightUpperArm' | 'rightForeArm' | 'rightHand'
  | 'leftUpLeg' | 'leftLeg' | 'leftFoot'
  | 'rightUpLeg' | 'rightLeg' | 'rightFoot';

export interface RuntimeWarriorRig {
  readonly skeleton: THREE.Skeleton;
  readonly bones: ReadonlyMap<RuntimeRigBoneId, THREE.Bone>;
  readonly boneIndices: ReadonlyMap<RuntimeRigBoneId, number>;
}

export function normalizeRigBoneName(name: string): string;
export function resolveRuntimeWarriorRig(source: THREE.SkinnedMesh): RuntimeWarriorRig;
export function applyProximitySkinning(
  geometry: THREE.BufferGeometry,
  region: RuntimeDeformRegion,
  rig: RuntimeWarriorRig
): void;
export function validateSkinAttributes(geometry: THREE.BufferGeometry): void;
```

- [ ] **Passo 1: escrever testes de nomes, distância de segmento e influência.**

```ts
it('normalizes the Mixamo hand name used by GLTFLoader', () => {
  expect(normalizeRigBoneName('mixamorig:RightHand')).toBe('mixamorigrighthand');
  expect(normalizeRigBoneName('mixamorigRightHand')).toBe('mixamorigrighthand');
});

it('keeps only four normalized proximity influences', () => {
  const geometry = simpleArmGeometry();
  applyProximitySkinning(geometry, 'rightArm', rigWithRightArm());
  const weights = geometry.getAttribute('skinWeight');
  const indices = geometry.getAttribute('skinIndex');
  expect(weights.itemSize).toBe(4);
  expect(indices.itemSize).toBe(4);
  for (let vertex = 0; vertex < weights.count; vertex++) {
    expect(sumWeight(weights, vertex)).toBeCloseTo(1, 6);
    expect(activeInfluenceCount(weights, vertex)).toBeLessThanOrEqual(4);
  }
});

it('fails before attachment when an anatomical transition bone is absent', () => {
  expect(() => resolveRuntimeWarriorRig(skinnedMeshWithout('mixamorigRightForeArm')))
    .toThrow(/RightForeArm/);
});
```

- [ ] **Passo 2: executar os testes para obter falha inicial.**

  Executar: `npm test -- src/characters/RuntimeWarriorSkinning.test.ts`

  Esperado: falha de importação.

- [ ] **Passo 3: implementar o mapa e o cálculo estável.**

  Normalizar nomes removendo `:`, `_`, `-` e capitalização antes de comparar aliases Mixamo. Localizar um `SkinnedMesh` de referência e seus índices no `Skeleton`; verificar todos os ossos requeridos antes de gerar qualquer atributo. Para cada vértice, converter a ponta e a base de cada candidato para o espaço local do modelo e calcular a distância ao segmento. Usar `max(0, 1 - distance / radius)²`; descartar valores abaixo de `0.001`; escolher os quatro maiores, normalizar e preencher sempre quatro slots. Definir candidatos de transição para ombro, cotovelo, punho, quadril, joelho, tornozelo e pescoço, em vez de procurar todos os 65 ossos.

  `validateSkinAttributes` deve rejeitar atributo ausente, NaN, índice fora do skeleton, peso negativo, soma distante de um e mais de quatro influências ativas. Não usar closures, objetos por vértice ou `Vector3` novo dentro do loop; reutilizar vetores de trabalho de módulo ou operar com escalares.

- [ ] **Passo 4: integrar os atributos no contrato Three.js.**

  Escrever `skinIndex` como `Uint16BufferAttribute(..., 4)` e `skinWeight` como `Float32BufferAttribute(..., 4)`. Testar explicitamente uma geometria de torso, uma de braço e uma de perna, incluindo a troca gradual na articulação.

- [ ] **Passo 5: executar as verificações.**

  Executar: `npm test -- src/characters/RuntimeWarriorSkinning.test.ts src/characters/RuntimeWarriorGeometry.test.ts && npm run typecheck`

  Esperado: aprovação; todos os vértices são finitos, possuem quatro slots ou menos e somam um.

## Task 3 — Criar os sete materiais PBR compartilhados

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorMaterials.ts`
- Criar: `src/characters/RuntimeWarriorMaterials.test.ts`

**Interfaces:**

```ts
export interface RuntimeWarriorMaterialLibrary {
  readonly skin: THREE.MeshStandardMaterial;
  readonly eye: THREE.MeshStandardMaterial;
  readonly hair: THREE.MeshStandardMaterial;
  readonly cloth: THREE.MeshStandardMaterial;
  readonly leather: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  get(role: RuntimeMaterialRole): THREE.MeshStandardMaterial;
}

export function getRuntimeWarriorMaterials(): RuntimeWarriorMaterialLibrary;
```

- [ ] **Passo 1: escrever testes de biblioteca compartilhada.**

```ts
it('returns seven stable material roles without texture downloads', () => {
  const materials = getRuntimeWarriorMaterials();
  expect(Object.values(materials).filter(value => value instanceof THREE.Material)).toHaveLength(7);
  expect(getRuntimeWarriorMaterials().steel).toBe(materials.steel);
  for (const role of MATERIAL_ROLES) {
    expect(materials.get(role).map).toBeNull();
    expect(materials.get(role).roughness).toBeGreaterThanOrEqual(0);
  }
});
```

- [ ] **Passo 2: executar e confirmar a falha.**

  Executar: `npm test -- src/characters/RuntimeWarriorMaterials.test.ts`

  Esperado: falha de importação.

- [ ] **Passo 3: implementar aparência legível sob o renderer atual.**

  Criar uma biblioteca lazy singleton de sete `MeshStandardMaterial`: pele quente pouco metálica; olho escuro com `roughness` baixa; cabelo e tecido ásperos; couro marrom escuro; aço cinza azulado com `metalness` alto; metal escuro para guarnições. Usar `onBeforeCompile` apenas para uma variação suave baseada na posição local e derivadas, sem sampler, sem textura, sem tempo e sem mutação por frame. Preservar `skinning=true` nas instâncias de material aplicadas aos `SkinnedMesh`es.

- [ ] **Passo 4: verificar.**

  Executar: `npm test -- src/characters/RuntimeWarriorMaterials.test.ts && npm run typecheck`

  Esperado: aprovação; exatamente sete materiais são compartilhados e nenhum solicita asset externo.

## Task 4 — Montar a fábrica transacional e integrar o jogador com fallback seguro

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorFactory.ts`
- Criar: `src/characters/RuntimeWarriorFactory.test.ts`
- Modificar: `src/entities/Player.ts`
- Modificar: `src/entities/PlayerAnimationPreview.integration.test.ts` (somente se o construtor precisar de uma dependência injetável)

**Interfaces:**

```ts
export interface RuntimeWarriorVisual {
  readonly root: THREE.Group;
  readonly triangleCount: number;
  readonly drawCallCount: number;
  readonly materials: RuntimeWarriorMaterialLibrary;
  dispose(): void;
}

export type RuntimeWarriorMountResult =
  | { readonly kind: 'mounted'; readonly visual: RuntimeWarriorVisual }
  | { readonly kind: 'fallback'; readonly reason: string };

export function mountRuntimeWarrior(model: THREE.Group): RuntimeWarriorMountResult;
```

- [ ] **Passo 1: escrever testes de montagem e reversão.**

```ts
it('binds generated skinned meshes to the source skeleton before hiding GLB meshes', () => {
  const model = modelWithCompleteMixamoSkeleton();
  const result = mountRuntimeWarrior(model);
  expect(result.kind).toBe('mounted');
  if (result.kind === 'mounted') {
    expect(result.visual.root.getObjectByName('RuntimeWarrior_Body')).toBeTruthy();
    expect(originalSkinnedMeshes(model).every(mesh => mesh.visible === false)).toBe(true);
    expect(runtimeSkinnedMeshes(result.visual.root).every(mesh => mesh.skeleton === sourceSkeleton(model))).toBe(true);
  }
});

it('keeps every original GLB mesh visible after a missing-bone factory failure', () => {
  const model = modelWithMissingMixamoBone();
  expect(mountRuntimeWarrior(model)).toEqual(expect.objectContaining({ kind: 'fallback' }));
  expect(originalSkinnedMeshes(model).every(mesh => mesh.visible)).toBe(true);
  expect(model.getObjectByName('RuntimeWarrior')).toBeUndefined();
});
```

- [ ] **Passo 2: executar para obter a falha inicial.**

  Executar: `npm test -- src/characters/RuntimeWarriorFactory.test.ts`

  Esperado: falha de importação.

- [ ] **Passo 3: montar fora do grafo visível e fazer bind correto.**

  Localizar a primeira `SkinnedMesh` válida; resolver o rig; obter as geometrias e aplicar pesos nas partes deformáveis. Para cada uma, criar `new THREE.SkinnedMesh(geometry, material)`, definir nome previsível, `castShadow/receiveShadow`, e chamar `mesh.bind(source.skeleton, source.bindMatrix)`. Anexar placas rígidas à `THREE.Bone` configurada. Criar o grupo temporário sem anexá-lo ao modelo, validar pesos, bounding boxes, triângulos, materiais e draw calls. Só então adicionar o grupo `RuntimeWarrior` ao modelo e definir `visible=false` em cada `SkinnedMesh` original.

  Em qualquer exceção, remover/descartar tudo o que foi criado, deixar as malhas originais visíveis e retornar `{ kind: 'fallback', reason }`. Registrar o motivo pelo `Logger` existente, sem lançar do carregamento. `dispose()` deve remover o grupo, descartar somente geometrias da instância, restaurar a visibilidade original e não tocar no `Skeleton`, nos clips ou nos materiais globais.

- [ ] **Passo 4: chamar a fábrica de `Player.load()` sem alterar o mixer.**

  Depois de `assets.createModel()` e antes de criar `AnimationMixer`, chamar `mountRuntimeWarrior(model)` apenas para o personagem `paladin`. Armazenar a visualização retornada para descarte. Manter a continuação normal tanto no caso `mounted` quanto no caso `fallback`; o mixer sempre aponta para o mesmo `model`, portanto Idle, corrida, reação, morte e ataque não recebem um caminho novo. Tornar a fábrica injetável no construtor somente se os testes atuais precisarem simular uma falha.

- [ ] **Passo 5: executar testes de integração e build.**

  Executar: `npm test -- src/characters/RuntimeWarriorFactory.test.ts src/entities/PlayerAnimationPreview.integration.test.ts src/characters/CharacterAssetStore.test.ts && npm run typecheck && npm run build`

  Esperado: aprovação; modelo de teste sem rig usa fallback e o jogo continua carregável.

## Task 5 — Fornecer a espada procedural ao baú sem baixar `sword.glb`

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorWeapon.ts`
- Criar: `src/characters/RuntimeWarriorWeapon.test.ts`
- Modificar: `src/equipment/RewardAssetStore.ts`
- Modificar: `src/equipment/RewardAssetStore.test.ts`
- Modificar: `src/equipment/WeaponAttachment.test.ts` (se necessário para cobrir os bounds procedurais)

**Interfaces:**

```ts
export function createRuntimeWarriorSword(): THREE.Group;
export function isRuntimeWeapon(id: EquipmentId): boolean;
```

- [ ] **Passo 1: escrever os testes de não-download e encaixe.**

```ts
it('treats the procedural sword as available without calling the loader for sword.glb', async () => {
  const loadAsync = vi.fn(async (path: string) => gltfFor(path));
  const store = new RewardAssetStore({ loadAsync });
  await store.loadAll();
  expect(store.hasWeapon('sword')).toBe(true);
  expect(loadAsync).not.toHaveBeenCalledWith('/models/sword.glb');
  expect(store.createWeapon('sword').getObjectByName('RuntimeWarrior_SwordBlade')).toBeTruthy();
});

it('creates a non-empty sword whose grip can be attached to the right hand', () => {
  const sword = createRuntimeWarriorSword();
  expect(new THREE.Box3().setFromObject(sword).isEmpty()).toBe(false);
  expect(attachWeaponToSocket(mixamoCharacter(), sword, swordDefinition)).not.toBeNull();
});
```

- [ ] **Passo 2: executar para confirmar a falha.**

  Executar: `npm test -- src/characters/RuntimeWarriorWeapon.test.ts src/equipment/RewardAssetStore.test.ts`

  Esperado: falha de importação ou de expectativa do loader.

- [ ] **Passo 3: criar lâmina e registrar arma virtual.**

  Construir uma `Group` com origem no grip, lâmina dupla afunilada com fuller, guarda, cabo de couro e pomo. Reutilizar materiais da Tarefa 3 e calcular bounds. Usar papéis `steel`, `darkMetal` e `leather`, sem criar oitavo material. Nomear `RuntimeWarrior_Sword`, `RuntimeWarrior_SwordBlade`, `RuntimeWarrior_SwordGuard` e `RuntimeWarrior_SwordGrip` para inspeção e efeitos posteriores.

  Em `RewardAssetStore.loadAll()`, contabilizar a espada runtime como trabalho concluído imediato e não criar requisição para `/models/sword.glb`. `hasWeapon('sword')` deve retornar verdadeiro quando a fábrica estiver disponível; `createWeapon('sword')` deve retornar uma nova `Group` procedural. Não alterar a rota do baú, o erro de arma, nem o carregamento do machado. `WeaponAttachment` continua sendo a única rotina que põe a lâmina na mão direita.

- [ ] **Passo 4: executar as verificações.**

  Executar: `npm test -- src/characters/RuntimeWarriorWeapon.test.ts src/equipment/RewardAssetStore.test.ts src/equipment/WeaponAttachment.test.ts && npm run typecheck`

  Esperado: aprovação; escolher espada no baú cria uma espada runtime e escolher machado preserva o fluxo GLB existente.

## Task 6 — Implementar máquina de estado para combo rápido

**Arquivos:**

- Criar: `src/combat/SwordComboController.ts`
- Criar: `src/combat/SwordComboController.test.ts`

**Interfaces:**

```ts
export const SWORD_COMBO_STAGES = [
  { duration: 0.33, damageOpen: 0.34, damageClose: 0.64, bufferOpen: 0.48 },
  { duration: 0.36, damageOpen: 0.30, damageClose: 0.62, bufferOpen: 0.46 },
  { duration: 0.40, damageOpen: 0.28, damageClose: 0.64, bufferOpen: 0.44 },
] as const;

export type SwordComboEvent =
  | { readonly type: 'stage-started'; readonly stage: number }
  | { readonly type: 'damage-opened'; readonly stage: number }
  | { readonly type: 'damage-closed'; readonly stage: number }
  | { readonly type: 'combo-ended' };

export class SwordComboController {
  public request(): boolean;
  public update(delta: number): readonly SwordComboEvent[];
  public cancel(): void;
  public get activeStage(): number | null;
  public get active(): boolean;
}
```

- [ ] **Passo 1: escrever testes de janelas, buffer e delta grande.**

```ts
it('opens one damage window and ends the first 0.33-second stage', () => {
  const combo = new SwordComboController();
  combo.request();
  expect(combo.update(0.10).map(event => event.type)).not.toContain('damage-opened');
  expect(combo.update(0.02).map(event => event.type)).toContain('damage-opened');
  expect(combo.update(0.21).map(event => event.type)).toContain('combo-ended');
});

it('buffers a second and third input only in their valid windows', () => {
  const combo = new SwordComboController();
  combo.request();
  combo.update(0.18); combo.request();
  expect(combo.update(0.15).some(event => event.type === 'stage-started' && event.stage === 1)).toBe(true);
  combo.update(0.18); combo.request();
  expect(combo.update(0.18).some(event => event.type === 'stage-started' && event.stage === 2)).toBe(true);
});

it('does not skip damage-close or stage end when a long frame crosses thresholds', () => {
  const combo = new SwordComboController();
  combo.request();
  expect(combo.update(0.40).map(event => event.type)).toEqual([
    'damage-opened', 'damage-closed', 'combo-ended',
  ]);
});
```

- [ ] **Passo 2: executar e confirmar falha inicial.**

  Executar: `npm test -- src/combat/SwordComboController.test.ts`

  Esperado: falha de importação.

- [ ] **Passo 3: implementar controlador sem alocação persistente por frame.**

  Armazenar somente estágio, tempo, flag de buffer e flags de transição. `request()` inicia o estágio zero quando o controlador está ocioso; durante um estágio, registra apenas um próximo estágio se já passou de `bufferOpen`. `update()` deve detectar cada limiar cruzado, inclusive com delta grande, reutilizando um array interno de eventos limpo em lugar. Encerrar ao fim de cada estágio se não houver buffer; após o terceiro estágio, sempre emitir `combo-ended`. `cancel()` deve limpar o estado sem eventos de dano posteriores.

- [ ] **Passo 4: executar as verificações.**

  Executar: `npm test -- src/combat/SwordComboController.test.ts && npm run typecheck`

  Esperado: aprovação; nenhuma janela de dano é pulada, duplicada ou mantida depois do fim.

## Task 7 — Integrar combo, dano por estágio, rastro enxuto e movimento suave no `Player`

**Arquivos:**

- Criar: `src/entities/PlayerMovement.ts`
- Criar: `src/entities/PlayerMovement.test.ts`
- Criar: `src/entities/PlayerCombo.integration.test.ts`
- Criar: `src/effects/SwordTrail.ts`
- Criar: `src/effects/SwordTrail.test.ts`
- Modificar: `src/entities/Player.ts`
- Modificar: `src/equipment/WeaponAttachment.ts`
- Modificar: `src/equipment/WeaponAttachment.test.ts`

**Interfaces:**

```ts
export function approachMovementSpeed(
  current: number, target: number, acceleration: number, deceleration: number, delta: number
): number;

export class SwordTrail {
  public readonly object: THREE.Mesh;
  public attach(weapon: THREE.Object3D): void;
  public setActive(active: boolean): void;
  public update(): void;
  public dispose(): void;
}
```

- [ ] **Passo 1: escrever os testes de comportamento visível.**

```ts
it('accelerates and decelerates without passing the requested movement speed', () => {
  expect(approachMovementSpeed(0, 4.5, 14, 18, 0.1)).toBeCloseTo(1.4);
  expect(approachMovementSpeed(4.5, 0, 14, 18, 0.1)).toBeCloseTo(2.7);
  expect(approachMovementSpeed(4.4, 4.5, 14, 18, 0.1)).toBe(4.5);
});

it('hits an in-range target once per combo stage and never at stage start', () => {
  const player = loadedPlayerWithSword();
  const hits: string[] = [];
  player.attackEnemy(enemyAt(1), () => hits.push('hit'));
  player.update(0.08);
  expect(hits).toEqual([]);
  player.update(0.05);
  expect(hits).toEqual(['hit']);
  player.requestAttackContinuation();
  player.update(0.25);
  expect(hits).toEqual(['hit', 'hit']);
});

it('reuses one sword-trail geometry while opening and closing damage windows', () => {
  const trail = new SwordTrail();
  const geometry = trail.object.geometry;
  trail.setActive(true); trail.update(); trail.setActive(false); trail.update();
  expect(trail.object.geometry).toBe(geometry);
  expect(trail.object.visible).toBe(false);
});
```

- [ ] **Passo 2: executar para confirmar os testes vermelhos.**

  Executar: `npm test -- src/entities/PlayerMovement.test.ts src/entities/PlayerCombo.integration.test.ts src/effects/SwordTrail.test.ts`

  Esperado: falha de importação e de comportamento antigo de dano imediato.

- [ ] **Passo 3: substituir o swing único pela máquina de combo.**

  Em `Player`, substituir `swingTimer`, `swingDuration` e `hasDealtDamageThisSwing` pelo `SwordComboController`, três `AnimationAction` que reutilizam `AttackHorizontal` e um `Set<THREE.Object3D>` limpo quando cada estágio começa. Configurar cada ação `LoopOnce`, `clampWhenFinished=true`, tempo de reprodução correspondente às três durações e crossfade de `0.06s`. Se não houver três clipes nativos, as três ações usam clones/instâncias do mesmo `AttackHorizontal`, preservando o mixer atual e sem root motion nos eixos já tratados por `CharacterAnimations`.

  Abrir o rastro e aplicar dano somente no evento `damage-opened`, se o alvo ainda está no alcance. Fechar o rastro em `damage-closed`; em `combo-ended`, voltar para Idle/Running. Para alvo marcado por clique/auto-ataque, solicitar continuação automaticamente enquanto ele continuar válido e dentro do alcance; para ataque no cursor, um novo clique durante a janela é o buffer. Cancelar o combo, limpar o Set e ocultar o rastro em hit, morte, respawn, mudança de alvo fora do alcance, cancelamento de movimento e desequipar. Remover os callbacks de dano garantido no início/25%/fim do swing antigo.

- [ ] **Passo 4: suavizar deslocamento sem alterar colisão nem alcance.**

  Introduzir `currentMoveSpeed` no `Player`; aproximar de `speed * speedMultiplier` com aceleração `14` e desaceleração `18`. Usar a mesma velocidade calculada tanto em teclado quanto em `moveTo`, manter o limite de passo e as regras de colisão existentes, e ajustar a taxa da animação de corrida para `clamp(currentMoveSpeed / nominalSpeed, 0.75, 1.15)`. Usar crossfade de `0.15s` na passagem Idle/Running. O personagem não pode deslizar durante uma janela ativa de ataque.

- [ ] **Passo 5: implementar rastro reutilizável.**

  Expor o objeto equipado atual em `WeaponEquipment` sem alterar a API de equipar. `SwordTrail` cria uma vez uma geometria com `Float32Array` de segmentos fixos; em `update()` lê as posições de base e ponta da lâmina nomeada, atualiza os arrays in-place e define `needsUpdate`. Não criar `Vector3`, geometria, material ou mesh em `update()`. A trilha é adicionada à espada somente quando a recompensa espada é equipada; o machado não recebe rastro.

- [ ] **Passo 6: executar verificações de integração.**

  Executar: `npm test -- src/combat/SwordComboController.test.ts src/entities/PlayerMovement.test.ts src/entities/PlayerCombo.integration.test.ts src/effects/SwordTrail.test.ts src/equipment/WeaponAttachment.test.ts && npm run typecheck && npm run build`

  Esperado: aprovação; três golpes velozes, no máximo um hit por alvo/estágio, nenhum dano antecipado e locomoção suavizada.

## Task 8 — Registrar orçamentos, validar no navegador e produzir prévia real

**Arquivos:**

- Criar: `src/characters/RuntimeWarriorBudget.ts`
- Criar: `src/characters/RuntimeWarriorBudget.test.ts`
- Modificar: `src/core/FramePerformanceMonitor.ts`
- Modificar: `src/core/FramePerformanceMonitor.test.ts`
- Criar: `artifacts/procedural-warrior/runtime-acceptance.md`
- Produzir: `artifacts/procedural-warrior/runtime-preview.png`
- Produzir: `artifacts/procedural-warrior/runtime-metrics.json`

**Interfaces:**

```ts
export interface RuntimeWarriorBudgetReport {
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materialRoles: number;
  readonly maxInfluences: number;
}

export function validateRuntimeWarriorBudget(
  visual: RuntimeWarriorVisual
): RuntimeWarriorBudgetReport;
```

- [ ] **Passo 1: escrever testes objetivos de orçamento e resumo de monitor.**

```ts
it('rejects a runtime warrior over the allowed triangles or draw calls', () => {
  expect(() => validateRuntimeWarriorBudget(fakeVisual({ triangles: 18_001, drawCalls: 8 })))
    .toThrow(/triangles/);
  expect(() => validateRuntimeWarriorBudget(fakeVisual({ triangles: 18_000, drawCalls: 9 })))
    .toThrow(/draw calls/);
});

it('includes runtime-warrior budget data in the ten-second performance summary', () => {
  const monitor = new FramePerformanceMonitor();
  monitor.sample(16, 0, contextWithRuntimeWarrior());
  expect(monitor.sample(16, 10_000, contextWithRuntimeWarrior()))
    .toContainEqual(expect.objectContaining({ kind: 'summary', averageFps: 62.5 }));
});
```

- [ ] **Passo 2: executar para confirmar a falha.**

  Executar: `npm test -- src/characters/RuntimeWarriorBudget.test.ts src/core/FramePerformanceMonitor.test.ts`

  Esperado: falha pela ausência do validador e do contexto extendido.

- [ ] **Passo 3: ligar métricas sem afetar o frame loop.**

  Validar na montagem a contagem de triângulos, draw calls, os sete papéis e influências. Acrescentar os valores apenas como números ao contexto de `FramePerformanceMonitor`; o monitor continua calculando média a cada 10 segundos e alertando frames de 80 ms. Nenhuma inspeção de geometria pode ocorrer por frame: `RuntimeWarriorVisual` armazena o relatório já calculado.

- [ ] **Passo 4: validar com servidor e navegador desktop.**

  Executar: `npm test && npm run typecheck && npm run build`.

  Depois, iniciar `npm run dev -- --host 127.0.0.1`, abrir o jogo no navegador integrado e percorrer uma rota de 60 segundos em aba visível: carregar, abrir baú, escolher espada, caminhar, atacar três vezes um inimigo, receber reação, morrer e renascer. Registrar as linhas de resumo do monitor em `runtime-metrics.json`; captar `runtime-preview.png` na cena real com espada equipada.

- [ ] **Passo 5: redigir aceite factual.**

  Em `runtime-acceptance.md`, listar cada critério da especificação, o teste/comando/evidência que o prova e estado `PASS` ou `BLOCKED`. Aceitar somente se: o personagem runtime aparece, as animações preservam corpo/roupa, a espada segue a mão, os budgets passam, o fallback foi coberto por teste e a rota mantém média de pelo menos 60 FPS. Se a média ficar abaixo de 60, reduzir primeiro segmentos de placas e superfícies ocultas, depois número de grupos de material; não relaxar o limite de pesos, alterar a regra de dano, ou remover o fallback.

## Ordem de execução e pontos de revisão

1. Tarefas 1–3 constroem dados puros e visual base sem tocar no jogador.
2. Tarefa 4 ativa o visual runtime de forma reversível e deve passar seus testes antes de qualquer mudança em combate.
3. Tarefa 5 elimina somente o download da espada e deve preservar a seleção de equipamento.
4. Tarefas 6–7 realizam combo e fluidez com testes de comportamento antes da integração.
5. Tarefa 8 é a porta de aceite: nenhum resultado visual ou de desempenho é afirmado sem artefato, monitor e verificação final.
