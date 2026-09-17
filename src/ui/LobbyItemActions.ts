import type { InventoryItemKind } from '../inventory/InventoryCatalog';

/** Where the clicked stack lives on the lobby screen. */
export type LobbyItemLocation = 'backpack' | 'equipment';

/**
 * Which contextual actions a clicked stack offers.
 *
 * `equipLabel` is null whenever the equip action is hidden, so callers cannot
 * accidentally label a button that is not there.
 */
export interface LobbyItemActionState {
  readonly equipVisible: boolean;
  readonly equipLabel: 'Equipar' | 'Desequipar' | null;
  readonly upgradeVisible: boolean;
  readonly destroyVisible: boolean;
  readonly destroyDisabled: boolean;
}

/**
 * Decides the contextual menu of a clicked stack from its item kind.
 *
 * Only wearable gear can be equipped or upgraded. Materials and consumables
 * used to show "Equipar"/"Aprimorar" as well, and clicking them answered with
 * "Este item não pode ser equipado." — an action the player could never take.
 * Their menu now offers destruction only, while equipped gear keeps the
 * unequip/upgrade pair and disables destruction (it must be taken off first).
 */
export function resolveLobbyItemActionState(
  kind: InventoryItemKind | undefined,
  location: LobbyItemLocation
): LobbyItemActionState {
  const equipped = location === 'equipment';
  // Anything already worn is by definition gear, even if the catalog entry
  // ever loses its `kind` (the profile is loaded from storage).
  const gear = equipped || kind === 'equipment';

  return {
    equipVisible: gear,
    equipLabel: gear ? (equipped ? 'Desequipar' : 'Equipar') : null,
    upgradeVisible: gear,
    destroyVisible: true,
    destroyDisabled: equipped,
  };
}
