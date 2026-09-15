export type AdminWave = 1 | 2 | 3 | 4 | 5 | 6;

export type AdminCommand =
  | { type: 'jump-wave'; wave: AdminWave }
  | { type: 'jump-boss' }
  | { type: 'hitkill-boss' }
  | { type: 'immortality'; enabled: boolean }
  | { type: 'admin-camera'; enabled: boolean }
  | { type: 'add-inventory-item'; itemId: string; quantity: number };

export class AdminCommandGate {
  public constructor(private readonly authorized: boolean) {}

  public dispatch(
    command: AdminCommand,
    execute: (command: AdminCommand) => void
  ): boolean {
    if (!this.authorized) return false;
    execute(command);
    return true;
  }
}
