# Warrior Build, Equipment and Elemental Combat Design

## Goal

Turn the warrior lobby and combat loop into a build-driven action RPG flow: the player starts armed, manages equipment and a compact backpack from the HUD, distributes 100 permanent attribute points, and uses readable fire/ice attacks with distance-based damage.

## Equipment and character access

- Equipment uses a two-column silhouette layout: helmet/chest, pants/gloves, boots/secondary weapon, then primary weapon across both columns.
- Warrior secondary weapon remains empty.
- The starter sword is equipped when the game starts; no world chest or starter weapon choice is created.
- The HUD shows a compact backpack below the admin panel and a circular portrait of the actual rendered warrior on the opposite side.
- Activating the portrait opens a modal with Equipment and Attributes tabs. The modal pauses combat, traps keyboard focus, closes with Escape, and restores focus.

## Attributes

Every profile receives 100 unspent points. Existing version-one profiles migrate without losing inventory or progression. Before confirmation, points can be added, removed, or reset freely. Confirmation is permitted only after all 100 points are assigned and permanently locks the allocation.

Attributes and effects:

- Strength: +0.5% physical damage and +0.3 maximum health per point.
- Attack: +0.20 base damage per point.
- Defense: damage reduction `defense / (defense + 160)`, capped at 55%.
- Agility: up to +25% movement speed and +20% attack speed.
- Critical Attack: +0.3 percentage points per point, capped at 35%; physical critical multiplier 1.5x.
- Critical Magic: same critical chance rules for elemental damage.
- Dodge: +0.25 percentage points per point, capped at 25%.

Reset options display the future prices (5 USDT or 1000 Guild Tokens) but remain unavailable until a real payment integration exists. No balance is fabricated and no deduction is simulated.

## Combat range and falloff

- Warrior attacks reach 7 m. Damage is full through 2 m, falls linearly to 30% at 7 m, and is zero beyond.
- Regular enemies reach 4 m. Damage is full through 1.25 m and falls to 25% at 4 m.
- Mini bosses reach 5 m. Damage is full through 1.5 m and falls to 30% at 5 m.
- Damage popups and health changes use the same final damage value after attribute, critical, dodge, defense, and falloff calculations.

## Elemental skills and VFX

- Remove the old heavy arc, smoke, spark, and generic skill VFX.
- `triplo_ataque` is the fire skill. While active, the sword displays a lightweight procedural flame effect. A hit applies fire damage over three seconds.
- `ataque_giratorio_2` becomes the ice skill. While active, the sword displays a lightweight procedural ice effect. A hit applies ice damage over three seconds and a 20% slow.
- Reapplying the same element refreshes its duration instead of stacking indefinitely.
- Other physical attacks have no persistent trail.

## Mini-boss skills

Mini bosses gain independent boss-style warning attacks:

- Red circle radius 8.75 m, 12 base damage.
- Red rectangle 60 x 12 m, 13 base damage.
- No meteor attack.
- Effects and timers are owned per mini boss so multiple mini bosses cannot clear each other's telegraphs.

## Visual direction and acceptance

The UI uses charcoal, iron, bone, gold, fire-orange, and ice-blue; Georgia/Segoe UI/Consolas typography; native RPG icons; responsive layouts; visible focus; and reduced-motion support.

Acceptance requires unit/integration tests, TypeScript/build success, real rendered desktop and mobile screenshots, complete keyboard-only traversal, and active reduced-motion verification.
