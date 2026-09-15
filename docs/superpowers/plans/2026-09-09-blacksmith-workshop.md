# Oficina do Ferreiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma oficina persistente com receitas do set comum e uma expedição de seis ondas seguida pelo boss final.

**Architecture:** `BlacksmithWorkshop` concentra validação de licença e crafting como transformações puras do perfil. `LobbyScreen` apenas apresenta diálogo, artes e ações, enquanto `Game` persiste uma transação aprovada e sincroniza o `InventoryStore`. As receitas são dados tipados para receber novos sets sem mudar a interface.

**Tech Stack:** TypeScript, Vitest, Three.js/WebGL, HTML/CSS e localStorage.

**Spec:** `docs/superpowers/specs/2026-09-09-blacksmith-workshop-design.md`

## Global Constraints

- Executar apenas em desktop WebGL.
- Deduzir exatamente 30 `guild-token` por licença de 36 horas.
- Cada peça comum consome 10 unidades de cada um dos cinco materiais comuns.
- Não consumir nenhum item quando faltar licença, materiais ou espaço.
- A campanha contém ondas 1–6 e, depois, boss final.

---

### Task 1: Domínio persistente da oficina

**Files:**
- Create: `src/crafting/BlacksmithWorkshop.ts`
- Create: `src/crafting/BlacksmithWorkshop.test.ts`
- Modify: `src/profile/PlayerProfile.ts`
- Test: `src/profile/PlayerProfile.test.ts`

**Interfaces:**
- Produces `purchaseBlacksmithLicense(profile, now)` e `craftBlacksmithRecipe(profile, recipeId, now)`.
- Produces `BLACKSMITH_RECIPES` e o estado `blacksmith.availableUntil` no perfil.

- [ ] **Step 1: Write the failing tests**

```ts
expect(purchaseBlacksmithLicense(profileWithTokens, now).kind).toBe('purchased');
expect(craftBlacksmithRecipe(activeProfile, 'common-forged-helmet', now).kind).toBe('crafted');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/crafting/BlacksmithWorkshop.test.ts src/profile/PlayerProfile.test.ts`

- [ ] **Step 3: Implement the pure transaction functions and schema migration**

```ts
export interface BlacksmithAccess { availableUntil: number | null; }
export const BLACKSMITH_LICENSE_COST = 30;
export const BLACKSMITH_LICENSE_DURATION_MS = 36 * 60 * 60 * 1000;
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/crafting/BlacksmithWorkshop.test.ts src/profile/PlayerProfile.test.ts`

### Task 2: Catálogo e artes do set comum

**Files:**
- Modify: `src/inventory/InventoryCatalog.ts`
- Modify: `src/inventory/InventoryCatalog.test.ts`
- Create: `public/blacksmith/{meal,payment,working}.png`
- Create: `public/items/equipment/common-forged/{helmet,chest,pants,gloves,boots}.png`

**Interfaces:**
- Produces cinco definições de equipamento compatíveis com os slots atuais e com `iconSrc` para a receita e a mochila.

- [ ] **Step 1: Write failing catalog tests**
- [ ] **Step 2: Run `npm test -- src/inventory/InventoryCatalog.test.ts` and verify RED**
- [ ] **Step 3: Add item definitions and copy the user-provided art to public paths**
- [ ] **Step 4: Run `npm test -- src/inventory/InventoryCatalog.test.ts` and verify GREEN**

### Task 3: Oficina e diálogo no lobby

**Files:**
- Modify: `index.html`
- Modify: `src/ui/LobbyScreen.ts`
- Modify: `src/ui/LobbyScreen.test.ts`
- Modify: `src/core/Game.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes `BlacksmithWorkshop` result objects through callbacks supplied by `Game`.
- Produces aba Oficina, diálogo, prazo restante, receita, feedback de erro e atualização da mochila.

- [ ] **Step 1: Write failing UI tests for decline, payment state and recipe availability**
- [ ] **Step 2: Run `npm test -- src/ui/LobbyScreen.test.ts` and verify RED**
- [ ] **Step 3: Implement the tab, dialogue, callbacks and steel/fire visual treatment**
- [ ] **Step 4: Run `npm test -- src/ui/LobbyScreen.test.ts` and verify GREEN**

### Task 4: Campanha de seis ondas

**Files:**
- Modify: `src/waves/*`
- Modify: `src/profile/CharacterProgression.ts`
- Modify: related `*.test.ts`

**Interfaces:**
- Produces a six-wave normal progression and boss final, with skills all unlocked through wave 6.

- [ ] **Step 1: Write failing progression and wave tests**
- [ ] **Step 2: Run the focused wave/progression tests and verify RED**
- [ ] **Step 3: Rebalance wave count, XP and skill unlock gates**
- [ ] **Step 4: Run focused tests and verify GREEN**

### Task 5: Verificação de entrega

**Files:**
- Test: all affected tests

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Run `npm run validate:warrior-glb`**
- [ ] **Step 4: Review the lobby at desktop resolution and verify the office flow visually**
