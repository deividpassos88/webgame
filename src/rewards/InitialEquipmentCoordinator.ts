import * as THREE from 'three';
import {
  getWeaponDefinition,
  type EquipmentId,
  type WeaponDefinition,
} from '../equipment/EquipmentCatalog';
import { RewardFlow, type ChestInteractionResult } from './RewardFlow';

export interface RewardChestPort {
  readonly root: THREE.Group;
  readonly interactionRadius: number;
  readonly collisionRadius: number;
  readonly openingComplete: boolean;
  readonly removable: boolean;
  beginOpening(): boolean;
  claim(): void;
  update(delta: number): void;
  dispose(): void;
}

export interface InitialEquipmentPlayerPort {
  readonly root: THREE.Object3D;
  moveTo(point: THREE.Vector3): void;
  cancelMovement(): void;
  setInputLocked(locked: boolean): void;
  equipWeapon(definition: WeaponDefinition, weapon: THREE.Group): boolean;
}

export interface InitialEquipmentHudPort {
  showRewardSelection(
    availability: Readonly<Record<EquipmentId, boolean>>
  ): void;
  hideRewardSelection(): void;
  showRewardError(message: string): void;
}

export interface InitialEquipmentAssetsPort {
  hasChest(): boolean;
  hasWeapon(id: EquipmentId): boolean;
  createChest(): THREE.Group;
  createWeapon(id: EquipmentId): THREE.Group;
}

export interface InitialEquipmentCoordinatorOptions {
  player: InitialEquipmentPlayerPort;
  hud: InitialEquipmentHudPort;
  assets: InitialEquipmentAssetsPort;
  createChest(model: THREE.Group): RewardChestPort;
}

export class InitialEquipmentCoordinator {
  private static readonly PLAYER_COLLISION_RADIUS = 0.4;
  private readonly flow = new RewardFlow();
  private chest: RewardChestPort | null = null;
  private readonly failedWeapons = new Set<EquipmentId>();

  constructor(private readonly options: InitialEquipmentCoordinatorOptions) {}

  public start(position: THREE.Vector3): THREE.Group | null {
    if (this.flow.state !== 'waiting-for-chest') return null;

    if (this.options.assets.hasChest()) {
      try {
        this.chest = this.options.createChest(this.options.assets.createChest());
      } catch {
        this.chest = null;
      }
    }

    const result = this.flow.start(this.chest !== null);
    if (result === 'spawn' && this.chest) {
      this.chest.root.position.copy(position);
      return this.chest.root;
    }
    if (result === 'choose') this.showChoices();
    return null;
  }

  public getChestRoot(): THREE.Group | null {
    return this.chest?.root ?? null;
  }

  public clickChest(): ChestInteractionResult {
    if (!this.chest) return 'ignored';
    const distance = this.options.player.root.position.distanceTo(
      this.chest.root.position
    );
    const result = this.flow.clickChest(distance);
    if (result === 'approach') {
      this.options.player.moveTo(this.chest.root.position);
    } else if (result === 'open') {
      this.beginOpening();
    }
    return result;
  }

  public update(delta: number): void {
    if (!this.chest) return;
    this.resolvePlayerChestCollision();
    this.chest.update(delta);

    if (this.flow.state === 'approaching') {
      const distance = this.options.player.root.position.distanceTo(
        this.chest.root.position
      );
      if (this.flow.playerDistanceChanged(distance) === 'open') {
        this.beginOpening();
      }
    }

    if (
      this.flow.state === 'opening' &&
      this.chest.openingComplete &&
      this.flow.openingFinished() === 'choose'
    ) {
      this.showChoices();
    }

    if (this.flow.state === 'claimed' && this.chest.removable) {
      this.chest.dispose();
      this.chest = null;
    }
  }

  public choose(id: EquipmentId): boolean {
    if (this.flow.state !== 'choosing') return false;
    const definition = getWeaponDefinition(id);
    if (!definition || !this.weaponAvailability()[id]) return false;

    try {
      const weapon = this.options.assets.createWeapon(id);
      if (!this.options.player.equipWeapon(definition, weapon)) {
        throw new Error(`A arma não encaixou em ${definition.socketName}.`);
      }
    } catch (error) {
      this.failedWeapons.add(id);
      this.options.hud.showRewardSelection(this.weaponAvailability());
      const detail = error instanceof Error ? error.message : String(error);
      this.options.hud.showRewardError(
        `${definition.label} não pôde ser equipada. ${detail}`
      );
      return false;
    }

    if (this.flow.claim(id) !== 'claimed') return false;
    this.chest?.claim();
    this.options.hud.hideRewardSelection();
    this.options.player.setInputLocked(false);
    return true;
  }

  public reset(position: THREE.Vector3): THREE.Group | null {
    this.chest?.dispose();
    this.chest = null;
    this.options.player.cancelMovement();
    this.options.player.setInputLocked(false);
    this.options.hud.hideRewardSelection();
    this.failedWeapons.clear();
    this.flow.reset();
    return this.start(position);
  }

  private beginOpening(): void {
    this.options.player.cancelMovement();
    this.chest?.beginOpening();
  }

  private resolvePlayerChestCollision(): void {
    if (!this.chest) return;

    const playerPosition = this.options.player.root.position;
    const chestPosition = this.chest.root.position;
    const offsetX = playerPosition.x - chestPosition.x;
    const offsetZ = playerPosition.z - chestPosition.z;
    const minimumDistance =
      this.chest.collisionRadius +
      InitialEquipmentCoordinator.PLAYER_COLLISION_RADIUS;
    const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
    if (distanceSquared >= minimumDistance * minimumDistance) return;

    const distance = Math.sqrt(distanceSquared);
    const normalX = distance > 1e-6 ? offsetX / distance : 0;
    const normalZ = distance > 1e-6 ? offsetZ / distance : 1;
    playerPosition.x = chestPosition.x + normalX * minimumDistance;
    playerPosition.z = chestPosition.z + normalZ * minimumDistance;
  }

  private showChoices(): void {
    this.options.player.cancelMovement();
    this.options.player.setInputLocked(true);
    this.options.hud.showRewardSelection(this.weaponAvailability());
  }

  private weaponAvailability(): Record<EquipmentId, boolean> {
    return {
      sword:
        this.options.assets.hasWeapon('sword') &&
        !this.failedWeapons.has('sword'),
      axe:
        this.options.assets.hasWeapon('axe') && !this.failedWeapons.has('axe'),
    };
  }
}
