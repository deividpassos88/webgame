import { describe, expect, it } from 'vitest';
import { bindUnavailableEquipmentRestart } from './EquipmentRestart';

class RestartButtonHud {
  private restartCallback: (() => void) | null = null;

  public onEquipmentRestart(callback: () => void): void {
    this.restartCallback = callback;
  }

  public onContinueWithoutReward(): void {
    throw new Error('The unavailable-equipment button must not continue without a weapon.');
  }

  public clickRestart(): void {
    this.restartCallback?.();
  }
}

describe('unavailable equipment restart wiring', () => {
  it('routes the visible restart action to restart instead of the legacy continuation', () => {
    const hud = new RestartButtonHud();
    let restartCount = 0;

    bindUnavailableEquipmentRestart(hud, () => {
      restartCount += 1;
    });
    hud.clickRestart();

    expect(restartCount).toBe(1);
  });
});
