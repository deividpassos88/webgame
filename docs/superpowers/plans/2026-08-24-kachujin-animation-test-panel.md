# Kachujin Animation Test Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all five native animations in the replacement GLB and expose a safe in-game button for previewing each one.

**Architecture:** Keep exported-name knowledge in `CharacterCatalog`, isolate preview ownership in `Player`, and let `HUD` own DOM events and active-button presentation. `Game` only wires the HUD callback to the loaded player.

**Tech Stack:** TypeScript, Three.js AnimationMixer, Vite, Vitest, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-08-24-kachujin-animation-test-panel.md`

## Global Constraints

- Preserve both selectable characters and existing gameplay controls.
- Use exact, case-sensitive GLB clip names: `Idle`, `running`, `ataque`, `hit`, `morte`.
- Preview buttons must not change HP, mana, death state, or deal damage.
- Use the existing Industrial debug visual language.

---

### Task 1: Correct the native clip map

**Files:**
- Modify: `src/characters/CharacterAnimations.test.ts`
- Modify: `src/characters/CharacterCatalog.ts`

**Interfaces:**
- Consumes: `resolveCharacterClips(characterId, source)`
- Produces: all five `CharacterAnimationState` entries for `paladin`

- [ ] **Step 1: Change the Paladin test fixture to the five names embedded in the new GLB**

```ts
paladin: [
  rotationClip('Idle', true),
  rotationClip('running', true),
  rotationClip('ataque', true),
  rotationClip('hit', true),
  rotationClip('morte', true),
]
```

- [ ] **Step 2: Run the focused test and confirm it fails with unresolved idle/running/attacking states**

Run: `npm test -- src/characters/CharacterAnimations.test.ts`

- [ ] **Step 3: Update the Paladin `clipMap` to the five exact exported names**

```ts
clipMap: {
  idle: 'Idle',
  running: 'running',
  attacking: 'ataque',
  hit: 'hit',
  dead: 'morte',
}
```

- [ ] **Step 4: Re-run the focused test and confirm every Paladin state resolves**

Run: `npm test -- src/characters/CharacterAnimations.test.ts`

### Task 2: Add safe animation-preview ownership

**Files:**
- Create: `src/entities/PlayerAnimationPreview.ts`
- Create: `src/entities/PlayerAnimationPreview.test.ts`
- Modify: `src/entities/Player.ts`

**Interfaces:**
- Produces: `AnimationPreviewState` with `select(state)`, `clear()`, `finish(state)` and `activeState`
- Produces: `Player.previewAnimation(state): boolean`

- [ ] **Step 1: Write tests showing looping states remain active and one-shot states return to idle**
- [ ] **Step 2: Run the focused test and confirm the missing module/API fails**
- [ ] **Step 3: Implement the minimal state owner and connect it to `Player.playState` and mixer completion**
- [ ] **Step 4: Run the focused tests and confirm preview state is independent of HP and combat flags**

Run: `npm test -- src/entities/PlayerAnimationPreview.test.ts`

### Task 3: Add the five-button test panel

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/HUD.ts`
- Modify: `src/core/Game.ts`

**Interfaces:**
- Produces: `HUD.onAnimationTest(callback)` and `HUD.setActiveAnimationTest(state)`
- Consumes: `Player.previewAnimation(state)`

- [ ] **Step 1: Add a focused DOM-independent test for the state-to-button labels and states**
- [ ] **Step 2: Run it and confirm the missing panel definition fails**
- [ ] **Step 3: Add semantic buttons for idle, running, attacking, hit, and dead; wire delegation through HUD and Game**
- [ ] **Step 4: Add Industrial styling and active-state presentation**
- [ ] **Step 5: Run all automated checks**

Run: `npm test && npm run build`

### Task 4: Browser verification

**Files:**
- Verify only

**Interfaces:**
- Consumes: built game and all five buttons
- Produces: observed evidence that each selected action animates the chosen model

- [ ] **Step 1: Start the Vite server and choose the second character**
- [ ] **Step 2: Confirm the warning banner is absent and the log reports 5 native clips / 5 resolved states**
- [ ] **Step 3: Click each animation button and confirm the active label and visible model motion**
- [ ] **Step 4: Confirm no browser console errors and no HP change from preview actions**

