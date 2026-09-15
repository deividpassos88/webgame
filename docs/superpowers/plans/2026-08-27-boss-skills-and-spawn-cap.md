# Boss Skills and Spawn Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar quatro habilidades ao boss final, afastar a câmera e manter no máximo oito inimigos vivos com reposição imediata em pares.

**Architecture:** `WaveManager` controla capacidade e composição sem depender da cena. `BossSkillController` mantém tempo, escolha aleatória e colisões 2D; `BossSkillEffects` somente desenha e descarta objetos Three.js. `Game` conecta controlador, efeitos e dano ao boss registrado.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-27-boss-skills-and-spawn-cap-design.md`

## Global Constraints

- Não usar subagentes.
- Câmera padrão `1.30`.
- Onda regular totaliza 25 entidades e nunca excede oito vivas.
- Reposição normal ocorre quando duas vagas estiverem abertas; a última entidade restante pode ocupar uma vaga.
- Mini-bosses substituem as posições globais 10 e 20 da onda.
- Avisos duram três segundos; descanso entre habilidades dura cinco segundos.
- Efeitos não projetam sombras e não escrevem logs por frame.
- O workspace não contém `.git`; substituir passos de commit por verificação local.

---

### Task 1: Camera and capacity-aware regular waves

**Files:**
- Modify: `src/core/CameraController.ts`
- Modify: `src/core/CameraController.test.ts`
- Modify: `src/waves/WaveManager.ts`
- Modify: `src/waves/WaveManager.test.ts`

**Interfaces:**
- Produces: `WaveManager.update(delta)` com solicitações de 8 no início e até 2 nas reposições.
- Preserves: `WaveSpawnRequest` e `acknowledgeSpawn` existentes.

- [ ] **Step 1: Write failing camera and wave tests**

```ts
expect(new CameraController(1).zoom).toBe(1.3);
expect(first.regularCount + first.miniBossCount).toBe(8);
// uma morte não repõe
expect(manager.update(0)).toEqual([]);
// segunda morte abre duas vagas
expect(next.regularCount + next.miniBossCount).toBe(2);
expect(manager.snapshot.alive).toBeLessThanOrEqual(8);
```

- [ ] **Step 2: Run RED verification**

Run: `npm test -- src/core/CameraController.test.ts src/waves/WaveManager.test.ts`

Expected: camera reports `1.15`, first request reports `5`, and refill behavior fails.

- [ ] **Step 3: Implement capacity calculation**

Set `defaultZoom = 1.30`. In `WaveManager`, calculate:

```ts
const remaining = this.config.enemiesPerWave - this.currentSpawned;
const vacancies = 8 - this.activeEntities.size;
const requested = this.currentSpawned === 0
  ? Math.min(8, remaining)
  : remaining === 1 && vacancies >= 1
    ? 1
    : vacancies >= 2 ? Math.min(2, vacancies, remaining) : 0;
```

Build regular/mini-boss counts from the next `requested` global positions so positions 10 and 20 remain mini-bosses. Do not use a spawn interval after a valid acknowledgement.

- [ ] **Step 4: Run GREEN verification**

Run: `npm test -- src/core/CameraController.test.ts src/waves/WaveManager.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Local checkpoint**

Run: `npm run typecheck`

Expected: exit code 0.

---

### Task 2: Pure final-boss skill controller

**Files:**
- Create: `src/entities/BossSkillController.ts`
- Create: `src/entities/BossSkillController.test.ts`
- Modify: `src/entities/Boss.ts`
- Modify: `src/waves/WaveEnemyFactory.test.ts`

**Interfaces:**
- Produces: `BossSkillController.update(delta, bossPosition, playerPosition): BossSkillFrame`.
- Produces: `BossSkillFrame` with `events`, `damage`, and optional `dashPosition`.
- Skill values: circle radius `3.5`; rectangle length `12`, width `4`; six meteors radius `1.35`; dash width `1.6`.

- [ ] **Step 1: Write failing state and collision tests**

```ts
const controller = new BossSkillController(() => 0);
expect(controller.update(5, boss, player).events[0].type).toBe('telegraph');
expect(controller.update(3, boss, player).damage).toBe(23);
expect(controller.phase).toBe('resting');
expect(controller.restRemaining).toBe(5);
```

Add table cases for circle `23`, rectangle `24`, meteor `9`, and dash `13`; test misses produce zero. Inject deterministic random values and assert consecutive selections differ.

- [ ] **Step 2: Run RED verification**

Run: `npm test -- src/entities/BossSkillController.test.ts src/waves/WaveEnemyFactory.test.ts`

Expected: missing controller module and boss range still `5.8`.

- [ ] **Step 3: Implement state machine and 2D hit tests**

Define:

```ts
export type BossSkillKind = 'circle' | 'rectangle' | 'meteors' | 'dash';
export type BossSkillPhase = 'resting' | 'telegraph';
export interface BossSkillFrame {
  events: BossSkillEvent[];
  damage: number;
  dashPosition?: THREE.Vector3;
}
```

Capture player position at telegraph start. Use squared X/Z distance for circles, projection onto an oriented local rectangle for rectangle/dash, and six deterministic radial offsets around the captured position for meteors. On impact emit one event, one approved damage value, reset rest to five seconds, and exclude the previous skill from the next random choice. Add `reset()`.

Set boss `attackRange: 1.9` in `createBoss`.

- [ ] **Step 4: Run GREEN verification**

Run: `npm test -- src/entities/BossSkillController.test.ts src/waves/WaveEnemyFactory.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Local checkpoint**

Run: `npm run typecheck`

Expected: exit code 0.

---

### Task 3: Lightweight telegraphs and fire impacts

**Files:**
- Create: `src/effects/BossSkillEffects.ts`
- Create: `src/effects/BossSkillEffects.test.ts`

**Interfaces:**
- Consumes: `BossSkillEvent` from `BossSkillController`.
- Produces: `handle(event)`, `update(delta)`, `clear()`, `activeObjectCount`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
const effects = new BossSkillEffects(scene);
effects.handle(telegraphEvent);
expect(effects.activeObjectCount).toBeGreaterThan(0);
expect([...materials].every((m) => m.transparent && !m.depthWrite)).toBe(true);
effects.handle(impactEvent);
effects.update(1.2);
expect(effects.activeObjectCount).toBe(0);
```

Add a second test that calls `clear()` and asserts `activeObjectCount === 0` plus one `dispose` event on each owned material and geometry.

- [ ] **Step 2: Run RED verification**

Run: `npm test -- src/effects/BossSkillEffects.test.ts`

Expected: missing effects module.

- [ ] **Step 3: Implement warnings and impacts**

Use `CircleGeometry`/`PlaneGeometry` rotated onto X/Z with red `MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false })`. Build impacts from small additive orange/red sprites or meshes plus `PointLight`, animate scale/opacity upward for at most `1.1s`, and never enable shadows. Meteor events include descending fire cores before the shared explosion. Track owned resources and dispose in `clear()`.

```ts
public handle(event: BossSkillEvent): void {
  if (event.type === 'telegraph') this.createTelegraph(event);
  else this.replaceTelegraphWithImpact(event);
}

public clear(): void {
  this.active.forEach((effect) => effect.dispose());
  this.active.length = 0;
}
```

- [ ] **Step 4: Run GREEN verification**

Run: `npm test -- src/effects/BossSkillEffects.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Local checkpoint**

Run: `npm run typecheck`

Expected: exit code 0.

---

### Task 4: Game integration, reset, and final verification

**Files:**
- Modify: `src/core/Game.ts`
- Modify: `src/waves/CombatEntityRegistry.ts`
- Modify: `src/waves/CombatEntityRegistry.test.ts`

**Interfaces:**
- Consumes: `BossSkillController`, `BossSkillEffects`, and `combatRegistry.mainBoss`.
- Preserves: player damage/death handling and boss health HUD.

- [ ] **Step 1: Write failing registry lifecycle test**

```ts
expect(registry.mainBoss).toBe(boss);
boss.takeDamage(boss.hp);
registry.update(2, player, onDamage);
expect(registry.mainBoss).toBeNull();
```

- [ ] **Step 2: Run RED verification**

Run: `npm test -- src/waves/CombatEntityRegistry.test.ts`

Expected: dead boss remains exposed as active boss until removal.

- [ ] **Step 3: Integrate controller and effects**

Create controller/effects when the final boss is registered. During each frame, if boss is alive, call the controller, forward events to effects, apply `frame.damage` through the existing player-damage path, and copy `dashPosition` to the boss root. Call effects `update(delta)`. On boss death, full run reset, or victory, call `controller.reset()` and `effects.clear()`.

```ts
private updateBossSkills(delta: number): void {
  const boss = this.combatRegistry.mainBoss;
  if (!boss || !this.bossSkills || !this.bossEffects) return;
  const frame = this.bossSkills.update(delta, boss.root.position, this.player.root.position);
  frame.events.forEach((event) => this.bossEffects!.handle(event));
  if (frame.dashPosition) boss.root.position.copy(frame.dashPosition);
  if (frame.damage > 0) this.damagePlayer(frame.damage, 'boss');
  this.bossEffects.update(delta);
}
```

Make `mainBoss` return only a living boss. Keep ordinary `Enemy.update` active so the boss walks and performs its common `1.9m` attack during the five-second rest.

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: every test passes with zero failures.

Run: `npm run build`

Expected: TypeScript and Vite finish with exit code 0; the existing bundle-size warning is acceptable.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev -- --host 127.0.0.1`

Verify: zoom farther away; no more than eight wave enemies; two replacements after two deaths; red warnings last three seconds without text; all four skills appear without immediate repetition; effects disappear after impact/reset; browser console contains no errors.
