# Salao do Guerreiro - Reference Redesign Assets

## Integrated now

- `lobby-warrior-background.png`: full environment only; loaded by `src/ui/LobbyPresentation.ts` into the Three.js backdrop scene.
- `panel-equipment-frame.png`: artistic dark metal/stone panel frame; used by the left equipment and right inventory panels through `src/styles/lobby-reference.css`.
- `equipment-slot-frame.png`: artistic equipment slot; used by all equipment slots.
- `warrior-banner.png`: cloth banner; used by `.hero-stage-banner`.
- `equipment-slot-refined.svg`: lighter inner frame used for empty lobby equipment slots.
- `icons/*.svg`: seven dedicated aged-metal silhouettes for the empty equipment states. Equipped items still use their own item artwork.
- `start-game-frame.svg`: layered ornamental asset used behind the real `#start-game` button text.

## Required next assets

These are explicit integration contracts. Do not replace them with generic CSS drawings.

- `lobby-warrior-background.webp`: optimized version of the integrated PNG, same 16:9 environment-only composition. The code can change the URL once the optimized asset is supplied.
- `panel-inventory-frame.png`: right-panel variation with its own asymmetric ornament.
- `equipment-slot-frame-active.png`: active/equipped variation with restrained inner gold illumination.
- `equipment-ornament-top.png`: narrow top cap for the equipment panel.
- `equipment-divider.png`: thin aged-metal separator for status and inventory headings.
- `lobby-platform.png`: low-perspective stone and metal dais without character.
- `footer-frame.png`: full-width low stone/metal footer band with restrained left crest space.

## Integration rules

- Keep the character, all UI labels, controls, and click targets in HTML/Three.js. Assets provide art only.
- Never bake the character or interface text into the background image.
- Preserve the transparent center of `.lobby-hero-stage` so `LobbyScreen` can scissor-render the Three.js character over the backdrop.

## Exact code integration points

| Asset | CSS selector / code owner | Intended behavior |
| --- | --- | --- |
| `lobby-warrior-background.webp` | `LOBBY_BACKDROP_URL` in `src/ui/LobbyPresentation.ts` | Replaces the current PNG with the same environment-only composition. Keep it in `backdropScene`, not as a CSS background. |
| `panel-inventory-frame.png` | `#lobby-screen .lobby-detail-panel` in `src/styles/lobby-reference.css` | Gives the inventory panel its own right-side metal/stone frame. |
| `equipment-slot-frame-active.png` | `#lobby-screen .equipment-slot.is-equipped` | Replaces the brightness-only active state with distinct supplied art. |
| `equipment-ornament-top.png` | `#lobby-screen .lobby-equipment::before` | Decorative cap only; it must not overlap the heading or slot click targets. |
| `equipment-divider.png` | Status and inventory heading separators in `src/styles/lobby-reference.css` | Replaces thin CSS rules without changing the layout height. |
| `lobby-platform.png` | `#lobby-screen .hero-stage-platform` | Only use if it aligns with the model. The current environment already includes a stone dais, so do not show two platforms. |
| `start-game-frame.svg` | `#lobby-screen #start-game` and its pseudo-elements | Integrated frame behind the real accessible button text and icon; button remains keyboard/click interactive. |
| `footer-frame.png` | `#lobby-screen .lobby-footer` | Full-width visual band behind the existing footer/status content. |
| `icons/*.svg` | Empty lobby equipment slots in `src/styles/lobby-reference.css` | Integrated item-state illustrations while retaining equipped artwork, drag/drop behavior, and existing fallback icons. |
