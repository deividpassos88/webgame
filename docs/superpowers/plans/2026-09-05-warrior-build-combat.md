# Warrior Build and Combat Implementation Plan

> Repository note: this workspace is not a Git repository, so task checkpoints are recorded in `.superpowers/sdd/2026-09-05-warrior-build-combat/progress.md` rather than commits.

1. Migrate the player profile to schema v2 with primary/secondary weapon slots and a validated, one-time 100-point attribute allocation. Add unit tests first.
2. Add pure, tested combat functions for attribute-derived stats, criticals, defense/dodge, distance falloff, elemental damage-over-time, and slow.
3. Replace the lobby and character equipment presentation with the approved silhouette grid, preserving inventory compatibility.
4. Build the accessible character modal with Equipment and Attributes tabs, allocation controls, confirmation, and unavailable future reset payment ports.
5. Remove the world chest runtime path, keep the starter sword equipped, add the compact HUD backpack, and replace the initials badge with a live warrior portrait.
6. Replace heavyweight attack effects with lightweight procedural fire and ice sword states and connect three-second elemental statuses to enemies.
7. Apply 7 m warrior, 4 m regular-enemy, and 5 m mini-boss distance falloff rules throughout actual damage delivery.
8. Add per-mini-boss circle and rectangle telegraph controllers at half boss dimensions and lower damage.
9. Run focused tests after each task, then the full suite, typecheck/build, browser desktop/mobile review, keyboard traversal, reduced-motion verification, and independent code review.
