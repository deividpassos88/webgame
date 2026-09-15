const MINI_BOSS_SLOT_COUNT = 4;

/**
 * Preserva a identidade dos slots da formação final. Posições dos inimigos são
 * deliberadamente irrelevantes: depois de registrados eles podem se mover.
 */
export class FinalBattleSlotRegistry {
  private phaseId: number | null = null;
  private readonly occupiedMiniBossSlots = new Set<number>();

  public availableMiniBossSlots(
    phaseId: number,
    requestedCount: number
  ): readonly number[] {
    this.ensurePhase(phaseId);
    if (!Number.isInteger(requestedCount) || requestedCount <= 0) return [];

    return Array.from({ length: MINI_BOSS_SLOT_COUNT }, (_, slot) => slot)
      .filter((slot) => !this.occupiedMiniBossSlots.has(slot))
      .slice(0, requestedCount);
  }

  public registerMiniBossSlot(phaseId: number, slot: number): boolean {
    this.ensurePhase(phaseId);
    if (
      !Number.isInteger(slot)
      || slot < 0
      || slot >= MINI_BOSS_SLOT_COUNT
      || this.occupiedMiniBossSlots.has(slot)
    ) {
      return false;
    }

    this.occupiedMiniBossSlots.add(slot);
    return true;
  }

  public reset(): void {
    this.phaseId = null;
    this.occupiedMiniBossSlots.clear();
  }

  private ensurePhase(phaseId: number): void {
    if (this.phaseId === phaseId) return;
    this.phaseId = phaseId;
    this.occupiedMiniBossSlots.clear();
  }
}
