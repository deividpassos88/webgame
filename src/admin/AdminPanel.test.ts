// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { AdminPanel, getAdminPanelDefinition } from './AdminPanel';
import type { AdminCommand } from './AdminCommandGate';
import type { AdminCommandResult } from './AdminGameActions';

describe('ADM panel definition', () => {
  it('does not define a panel for an unauthorized session', () => {
    expect(getAdminPanelDefinition(false)).toBeNull();
  });

  it('defines every approved testing command for an authorized session', () => {
    const definition = getAdminPanelDefinition(true);

    expect(definition?.waveButtons).toEqual([1, 2, 3, 4, 5, 6]);
    expect(definition?.spawnButtons).toEqual(['regular', 'mini-boss', 'boss']);
    expect(definition?.actions).toEqual([
      'jump-boss', 'hitkill-boss', 'immortality', 'admin-camera',
      'spawn-test-enemy', 'clear-test-enemies', 'toggle-training-dummy',
      'add-inventory-item',
    ]);
  });


  it('dispatches admin spawn buttons only after gameplay controls are available', () => {
    const host = document.createElement('div');
    const onCommand = vi.fn<(command: AdminCommand) => AdminCommandResult>(() => ({ ok: true }));
    const panel = AdminPanel.mount(host, true, onCommand)!;
    const regular = host.querySelector<HTMLButtonElement>('[data-admin-spawn-role="regular"]')!;
    const clear = host.querySelector<HTMLButtonElement>('[data-admin-command="clear-test-enemies"]')!;

    expect(regular.disabled).toBe(true);
    expect(clear.disabled).toBe(true);

    panel.setGameplayAvailable(true);
    regular.click();
    clear.click();

    expect(onCommand).toHaveBeenCalledWith({ type: 'spawn-test-enemy', role: 'regular' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'clear-test-enemies' });
  });

  it('toggles the practice dummy only after the game accepts the command', () => {
    const host = document.createElement('div');
    const onCommand = vi.fn<(command: AdminCommand) => AdminCommandResult>(() => ({ ok: true }));
    const panel = AdminPanel.mount(host, true, onCommand)!;
    const button = host.querySelector<HTMLButtonElement>('[data-admin-command="toggle-training-dummy"]')!;

    expect(button.disabled).toBe(true);
    panel.setGameplayAvailable(true);
    expect(button.disabled).toBe(false);

    button.click();
    expect(onCommand).toHaveBeenCalledWith({ type: 'toggle-training-dummy' });
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the dummy toggle off when the command is refused', () => {
    const host = document.createElement('div');
    const onCommand = vi.fn<(command: AdminCommand) => AdminCommandResult>(
      () => ({ ok: false, reason: 'unavailable' })
    );
    const panel = AdminPanel.mount(host, true, onCommand)!;
    panel.setGameplayAvailable(true);
    const button = host.querySelector<HTMLButtonElement>('[data-admin-command="toggle-training-dummy"]')!;

    button.click();

    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the inventory injection controls only for an authorized panel and dispatches a valid quantity', () => {
    const host = document.createElement('div');
    const onCommand = vi.fn<(command: AdminCommand) => AdminCommandResult>(() => ({ ok: true }));

    expect(AdminPanel.mount(host, false, onCommand)).toBeNull();
    expect(host.querySelector('[data-admin-inventory-item]')).toBeNull();

    AdminPanel.mount(host, true, onCommand);
    const item = host.querySelector<HTMLSelectElement>('[data-admin-inventory-item]');
    const quantity = host.querySelector<HTMLInputElement>('[data-admin-inventory-quantity]');
    const addButton = host.querySelector<HTMLButtonElement>('[data-admin-command="add-inventory-item"]');

    expect(item?.options.length).toBeGreaterThan(1);
    expect(quantity?.value).toBe('1');
    item!.value = 'guild-token';
    quantity!.value = '30';
    addButton!.click();

    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-inventory-item', itemId: 'guild-token', quantity: 30,
    });
  });

  it('keeps an invalid inventory quantity inside the ADM panel instead of dispatching it', () => {
    const host = document.createElement('div');
    const onCommand = vi.fn<(command: AdminCommand) => AdminCommandResult>(() => ({ ok: true }));
    AdminPanel.mount(host, true, onCommand);
    const quantity = host.querySelector<HTMLInputElement>('[data-admin-inventory-quantity]');
    const addButton = host.querySelector<HTMLButtonElement>('[data-admin-command="add-inventory-item"]');

    quantity!.value = '1.5';
    addButton!.click();

    expect(onCommand).not.toHaveBeenCalled();
    expect(host.querySelector('[data-admin-inventory-message]')?.textContent)
      .toBe('Informe uma quantidade inteira positiva.');
  });
});
