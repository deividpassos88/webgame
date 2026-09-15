# Kachujin Animation Test Panel Design

The replacement `dragonminer-optimized2.glb` exports five native clips named exactly `Idle`, `running`, `ataque`, `hit`, and `morte`. The game must map the Paladin slot to those case-sensitive names so every gameplay state resolves without retargeting.

Add a gameplay-only animation test panel with one button for each resolved state: Parado, Correr, Atacar, Receber golpe, and Morrer. Clicking a button previews its clip directly without changing health or causing gameplay damage. Looping previews continue until another state is selected; one-shot previews return to idle when their mixer action finishes. The active test button is visibly highlighted.

The panel follows the existing debug UI's Industrial direction: pitch-black translucent surface, monospace typography, one amber signal color, flat one-pixel borders, and no decorative shadows or rounded cards. It is hidden during loading and character selection and shown after the chosen player has loaded.

The replacement rig stores forward root motion on the local Y axis of `mixamorig:Hips`, while local Z carries vertical pose changes. All native clips for this character must therefore be converted to in-place playback by locking local X/Y to their first keyframe and preserving local Z. World displacement remains owned by `Player.root`, preventing loop and transition snaps without removing vertical attack, hit, or death posing.
