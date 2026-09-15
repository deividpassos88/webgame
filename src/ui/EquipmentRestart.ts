export interface EquipmentRestartHud {
  onEquipmentRestart(callback: () => void): void;
}

export function bindUnavailableEquipmentRestart(
  hud: EquipmentRestartHud,
  restart: () => void
): void {
  hud.onEquipmentRestart(restart);
}
