export type AdminWave = 1 | 2 | 3 | 4 | 5 | 6;
export type AdminSpawnRole = 'regular' | 'mini-boss' | 'boss';

export type AdminCommand =
  | { readonly type: 'jump-wave'; readonly wave: AdminWave }
  | { readonly type: 'jump-boss' }
  | { readonly type: 'hitkill-boss' }
  | { readonly type: 'immortality'; readonly enabled: boolean }
  | { readonly type: 'admin-camera'; readonly enabled: boolean }
  | { readonly type: 'spawn-test-enemy'; readonly role: AdminSpawnRole }
  | { readonly type: 'clear-test-enemies' }
  | { readonly type: 'add-inventory-item'; readonly itemId: string; readonly quantity: number };

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
