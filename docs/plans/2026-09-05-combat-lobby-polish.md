# Combat and Lobby Polish Plan

**Goal:** Remove the normal-combo T-pose, guarantee whole-number combat damage, reduce the Warrior range to 5 m, and refine the lobby into a full-bleed Cinzafogo command screen.

## Design contract

- Approved by the user's direct request to execute these adjustments.
- Subject/audience: Fortaleza de Cinzafogo preparation hall for desktop and mobile action-RPG players.
- One job: prepare the Warrior and start the dungeon.
- Palette: Obsidian `#080B10`, Iron `#18222D`, Old Gold `#D8A94E`, Bone `#E8DEC8`, Ember `#E2642F`.
- Typography: Georgia display, Segoe UI body, Consolas utility/numeric.
- Layout: full-bleed war courtyard, centered 3D Warrior, translucent glass-metal side panels.
- Signature: a luminous gold forge line along the lower edge of every primary panel.
- Risk: stronger environmental visibility while preserving text contrast and model separation.
- Icons: project-native `RpgIcons` SVG set.
- Reference critique: keep the full-page scene, central hero and overlay hierarchy; revise opaque Fortnite blocks into Cinzafogo glass/metal; reject Fortnite branding and copy.

## Implementation

1. Add a regression test that advances the normal sword combo into its second stage and asserts that the animated arm remains driven by the attack clip.
2. Add whole-number damage tests and centralize combat quantization at the final outgoing/incoming boundary. Accumulate elemental fractional damage until an integer tick is earned.
3. Introduce one shared 5 m Warrior range constant and use it for falloff, player targeting and all five skill areas.
4. Refine the lobby CSS with a viewport-filling backdrop, restrained transparent gradients, blur, modern gold lower borders and responsive panel behavior.
5. Run focused tests, full tests, typecheck/build and GLB validation.
6. Review real desktop/mobile renders, keyboard-only traversal and active reduced-motion emulation.

## Acceptance

- No normal combo stage fades its own animation to zero.
- Applied and displayed damage is always a non-negative integer.
- Warrior targeting, falloff and skills end at 5 m.
- Lobby backdrop reaches every viewport edge; equipment and inventory remain legible through translucent panels.
- Real rendered desktop and mobile screenshots reviewed before Sol acceptance.
- Complete no-mouse traversal and active prefers-reduced-motion: reduce emulation completed before Sol acceptance.
