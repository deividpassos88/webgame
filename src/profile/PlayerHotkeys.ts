import type { WarriorSkillId } from '../combat/WarriorSkillCatalog';

export type PlayerHotkeyAction = WarriorSkillId;

export type PlayerHotkeys = Record<PlayerHotkeyAction, string>;

export const PLAYER_HOTKEY_ACTIONS: readonly PlayerHotkeyAction[] = [
  'ataque_giratorio',
  'ataque_giratorio_2',
  'pulo_atacando',
  'triplo_ataque',
  'corte_duplo',
] as const;

export const DEFAULT_PLAYER_HOTKEYS: PlayerHotkeys = {
  ataque_giratorio: '1',
  ataque_giratorio_2: '2',
  pulo_atacando: '3',
  triplo_ataque: '4',
  corte_duplo: '5',
};

const RESERVED_HOTKEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'i', 'q', 'h', 'k', 'escape', 'tab', 'enter',
]);

export type HotkeyRegistrationResult =
  | { readonly kind: 'updated'; readonly hotkeys: PlayerHotkeys }
  | { readonly kind: 'invalid' | 'reserved' | 'conflict'; readonly hotkeys: PlayerHotkeys };

export function normalizePlayerHotkey(key: string): string | undefined {
  const normalized = key === ' ' ? 'space' : key.trim().toLowerCase();
  return /^[a-z0-9]$/.test(normalized) || normalized === 'space' ? normalized : undefined;
}

export function isPlayerHotkeys(value: unknown): value is PlayerHotkeys {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== PLAYER_HOTKEY_ACTIONS.length || !PLAYER_HOTKEY_ACTIONS.every((action) => keys.includes(action))) {
    return false;
  }
  const bindings = PLAYER_HOTKEY_ACTIONS.map((action) => normalizePlayerHotkey(
    (value as Record<string, unknown>)[action] as string
  ));
  return bindings.every(Boolean)
    && new Set(bindings).size === bindings.length
    && bindings.every((binding) => !RESERVED_HOTKEYS.has(binding!));
}

export function registerPlayerHotkey(
  current: PlayerHotkeys,
  action: PlayerHotkeyAction,
  key: string
): HotkeyRegistrationResult {
  const normalized = normalizePlayerHotkey(key);
  if (!normalized) return { kind: 'invalid', hotkeys: current };
  if (RESERVED_HOTKEYS.has(normalized)) return { kind: 'reserved', hotkeys: current };
  if (PLAYER_HOTKEY_ACTIONS.some((candidate) => candidate !== action && current[candidate] === normalized)) {
    return { kind: 'conflict', hotkeys: current };
  }
  return { kind: 'updated', hotkeys: { ...current, [action]: normalized } };
}

export function displayPlayerHotkey(key: string): string {
  return key === 'space' ? 'Espaço' : key.toUpperCase();
}

export function playerHotkeyActionLabel(action: PlayerHotkeyAction): string {
  return action;
}
