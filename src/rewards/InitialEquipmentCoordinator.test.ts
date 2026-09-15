import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { EquipmentId, WeaponDefinition } from '../equipment/EquipmentCatalog';
import type { RewardChestPort } from './InitialEquipmentCoordinator';
import { InitialEquipmentCoordinator } from './InitialEquipmentCoordinator';

class TestChest implements RewardChestPort {
  public readonly root = new THREE.Group();
  public readonly interactionRadius = 2.2;
  public readonly collisionRadius = 0.65;
  public openingComplete = false;
  public removable = false;
  public opening = false;
  public claimed = false;
  public disposed = false;

  public beginOpening(): boolean {
    if (this.opening) return false;
    this.opening = true;
    return true;
  }

  public claim(): void {
    this.claimed = true;
  }

  public update(delta: number): void {
    if (this.opening && delta >= 0.7) this.openingComplete = true;
    if (this.claimed && delta >= 0.45) this.removable = true;
  }

  public dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
  }
}

function setup(options: {
  chest?: boolean;
  weapons?: Partial<Record<EquipmentId, boolean>>;
  equipSucceeds?: boolean;
} = {}) {
  const player = {
    root: new THREE.Group(),
    destination: null as THREE.Vector3 | null,
    locked: false,
    equipped: null as EquipmentId | null,
    moveTo(point: THREE.Vector3) { this.destination = point.clone(); },
    cancelMovement() { this.destination = null; },
    setInputLocked(value: boolean) { this.locked = value; },
    equipWeapon(definition: WeaponDefinition) {
      if (options.equipSucceeds === false) return false;
      this.equipped = definition.id;
      return true;
    },
  };
  const hud = {
    visible: false,
    restartVisible: false,
    error: '',
    availability: null as Record<EquipmentId, boolean> | null,
    showRewardSelection(availability: Readonly<Record<EquipmentId, boolean>>) {
      this.visible = true;
      this.availability = { ...availability };
      this.restartVisible = !availability.sword && !availability.axe;
    },
    hideRewardSelection() { this.visible = false; },
    showRewardError(message: string) { this.error = message; },
  };
  const assets = {
    hasChest: () => options.chest !== false,
    hasWeapon: (id: EquipmentId) => options.weapons?.[id] ?? true,
    createChest: () => new THREE.Group(),
    createWeapon: (_id: EquipmentId) => new THREE.Group(),
  };
  const chests: TestChest[] = [];
  const coordinator = new InitialEquipmentCoordinator({
    player,
    hud,
    assets,
    createChest: (model) => {
      expect(model).toBeInstanceOf(THREE.Group);
      const chest = new TestChest();
      chests.push(chest);
      return chest;
    },
  });
  return { coordinator, player, hud, chests };
}

describe('InitialEquipmentCoordinator', () => {
  it('starts one chest at the supplied position without a boss-defeat signal', () => {
    const fixture = setup();
    const position = new THREE.Vector3(0, 0, 7.5);

    const root = fixture.coordinator.start(position);

    expect(root?.position.toArray()).toEqual([0, 0, 7.5]);
    expect(fixture.coordinator.start(new THREE.Vector3())).toBeNull();
  });

  it('approaches a distant chest, opens it in range, and equips only once', () => {
    const fixture = setup();
    fixture.player.root.position.set(0, 0, 10);
    fixture.coordinator.start(new THREE.Vector3());

    expect(fixture.coordinator.clickChest()).toBe('approach');
    expect(fixture.player.destination?.toArray()).toEqual([0, 0, 0]);
    fixture.player.root.position.set(0, 0, 1.5);
    fixture.coordinator.update(0.1);
    expect(fixture.chests[0].opening).toBe(true);

    fixture.coordinator.update(0.7);
    expect(fixture.hud.visible).toBe(true);
    expect(fixture.coordinator.choose('sword')).toBe(true);
    expect(fixture.player.equipped).toBe('sword');
    expect(fixture.coordinator.choose('axe')).toBe(false);
  });

  it('keeps the player outside the physical chest footprint', () => {
    const fixture = setup();
    fixture.coordinator.start(new THREE.Vector3(0, 0, 0));
    fixture.player.root.position.set(0.2, 0, 0);

    fixture.coordinator.update(0);

    const horizontalDistance = Math.hypot(
      fixture.player.root.position.x,
      fixture.player.root.position.z
    );
    expect(horizontalDistance).toBeCloseTo(1.05, 5);
    expect(fixture.player.root.position.y).toBe(0);
  });

  it('disposes the live chest and creates a fresh chest on reset', () => {
    const fixture = setup();
    fixture.coordinator.start(new THREE.Vector3(0, 0, 1));

    const root = fixture.coordinator.reset(new THREE.Vector3(0, 0, 2));

    expect(fixture.chests).toHaveLength(2);
    expect(fixture.chests[0].disposed).toBe(true);
    expect(root?.position.toArray()).toEqual([0, 0, 2]);
    expect(fixture.coordinator.clickChest()).toBe('open');
  });

  it('shows choices directly when the chest model is unavailable', () => {
    const fixture = setup({ chest: false });

    expect(fixture.coordinator.start(new THREE.Vector3())).toBeNull();
    expect(fixture.hud.visible).toBe(true);
    expect(fixture.player.locked).toBe(true);
  });

  it('exposes restart when neither weapon is available', () => {
    const fixture = setup({ chest: false, weapons: { sword: false, axe: false } });

    fixture.coordinator.start(new THREE.Vector3());

    expect(fixture.hud.availability).toEqual({ sword: false, axe: false });
    expect(fixture.hud.restartVisible).toBe(true);
    expect(fixture.coordinator.choose('sword')).toBe(false);
  });
});
