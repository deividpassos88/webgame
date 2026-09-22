import type { InventoryMutationResult } from '../inventory/InventoryStore';
import { InventoryStore } from '../inventory/InventoryStore';
import type { PlayerProfile } from '../profile/PlayerProfile';
import { AdminCommandGate, type AdminCommand, type AdminSpawnRole, type AdminWave } from './AdminCommandGate';

export type AdminCommandResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'unauthorized'
        | 'unavailable'
        | 'backpack-full'
        | 'invalid-quantity'
        | 'stack-limit'
        | 'unknown-item'
        | 'persistence-failed';
    };

export interface AdminGamePorts {
  preparePhaseChange(): void;
  startWave(wave: AdminWave): void;
  startBoss(): void;
  hitkillBoss(): boolean;
  setImmortal(enabled: boolean): void;
  setAdminCamera(enabled: boolean): void;
  spawnTestEnemy(role: AdminSpawnRole): boolean;
  clearTestEnemies(): void;
  inventory: InventoryStore;
  profile: PlayerProfile;
  persistProfileState(): boolean;
}

export class AdminGameActions {
  public constructor(
    private readonly ports: AdminGamePorts,
    private readonly gate: AdminCommandGate
  ) {}

  public execute(command: AdminCommand): AdminCommandResult {
    let result: AdminCommandResult | undefined;
    const accepted = this.gate.dispatch(command, (authorizedCommand) => {
      result = this.executeAuthorized(authorizedCommand);
    });
    if (!accepted || !result) return { ok: false, reason: 'unauthorized' };
    return result;
  }

  private executeAuthorized(command: AdminCommand): AdminCommandResult {
    switch (command.type) {
      case 'jump-wave':
        this.ports.preparePhaseChange();
        this.ports.startWave(command.wave);
        return { ok: true };
      case 'jump-boss':
        this.ports.preparePhaseChange();
        this.ports.startBoss();
        return { ok: true };
      case 'hitkill-boss':
        return this.ports.hitkillBoss()
          ? { ok: true }
          : { ok: false, reason: 'unavailable' };
      case 'immortality':
        this.ports.setImmortal(command.enabled);
        return { ok: true };
      case 'admin-camera':
        this.ports.setAdminCamera(command.enabled);
        return { ok: true };
      case 'spawn-test-enemy':
        return this.ports.spawnTestEnemy(command.role)
          ? { ok: true }
          : { ok: false, reason: 'unavailable' };
      case 'clear-test-enemies':
        this.ports.clearTestEnemies();
        return { ok: true };
      case 'add-inventory-item':
        return this.addInventoryItem(command.itemId, command.quantity);
    }
  }

  private addInventoryItem(itemId: string, quantity: number): AdminCommandResult {
    const previousInventory = this.ports.inventory.toProfileInventory();
    const result = this.ports.inventory.add(itemId, quantity);
    if (!result.ok) return this.inventoryFailure(result);

    const serialized = this.ports.inventory.toProfileInventory();
    this.ports.profile.equipment = serialized.equipment;
    this.ports.profile.backpack = serialized.backpack;
    let persisted = false;
    try {
      persisted = this.ports.persistProfileState();
    } catch {
      persisted = false;
    }
    if (persisted) return { ok: true };

    this.ports.profile.equipment = previousInventory.equipment;
    this.ports.profile.backpack = previousInventory.backpack;
    this.ports.inventory.commitProfile(this.ports.profile);
    return { ok: false, reason: 'persistence-failed' };
  }

  private inventoryFailure(result: Exclude<InventoryMutationResult, { readonly ok: true }>): AdminCommandResult {
    return { ok: false, reason: result.reason };
  }
}
