import type { EquipmentId } from '../equipment/EquipmentCatalog';

export type RewardState =
  | 'waiting-for-chest'
  | 'closed'
  | 'approaching'
  | 'opening'
  | 'choosing'
  | 'claimed';

export type InitialEquipmentStartResult = 'spawn' | 'choose' | 'ignored';
export type ChestInteractionResult = 'approach' | 'open' | 'ignored';
export type OpeningResult = 'choose' | 'ignored';
export type ClaimResult = 'claimed' | 'ignored';

export class RewardFlow {
  private currentState: RewardState = 'waiting-for-chest';

  constructor(public readonly interactionRadius = 2.2) {}

  public get state(): RewardState {
    return this.currentState;
  }

  public start(chestAvailable: boolean): InitialEquipmentStartResult {
    if (this.currentState !== 'waiting-for-chest') return 'ignored';
    this.currentState = chestAvailable ? 'closed' : 'choosing';
    return chestAvailable ? 'spawn' : 'choose';
  }

  public reset(): void {
    this.currentState = 'waiting-for-chest';
  }

  public clickChest(distance: number): ChestInteractionResult {
    if (this.currentState !== 'closed' && this.currentState !== 'approaching') {
      return 'ignored';
    }
    if (distance <= this.interactionRadius) {
      this.currentState = 'opening';
      return 'open';
    }
    this.currentState = 'approaching';
    return 'approach';
  }

  public playerDistanceChanged(distance: number): ChestInteractionResult {
    if (this.currentState !== 'approaching') return 'ignored';
    if (distance > this.interactionRadius) return 'ignored';
    this.currentState = 'opening';
    return 'open';
  }

  public openingFinished(): OpeningResult {
    if (this.currentState !== 'opening') return 'ignored';
    this.currentState = 'choosing';
    return 'choose';
  }

  public claim(_id?: EquipmentId): ClaimResult {
    if (this.currentState !== 'choosing') return 'ignored';
    this.currentState = 'claimed';
    return 'claimed';
  }
}
