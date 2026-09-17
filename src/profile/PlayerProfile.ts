import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  BACKPACK_INITIAL_CAPACITY,
  isBackpackCapacity,
  normalizeBackpackCapacity,
} from '../inventory/InventoryCapacity';
import {
  ATTRIBUTE_KEYS,
  attributeAllocationAllowance,
  createDefaultCharacterAttributes,
  normalizeCharacterAttributes,
  totalCharacterAttributePoints,
  TOTAL_ATTRIBUTE_POINTS,
  type CharacterAttributeKey,
  type CharacterAttributes,
} from './CharacterAttributes';
import {
  awardExperience,
  createInitialProgression,
  experienceAtLevelStart,
  experienceRequiredForLevel,
  normalizeProgression,
  type CharacterProgression,
  type ExperienceEncounterRole,
} from './CharacterProgression';
import {
  DEFAULT_PLAYER_HOTKEYS,
  isPlayerHotkeys,
  type PlayerHotkeys,
} from './PlayerHotkeys';

/** The key stays stable so existing browser saves can be upgraded in place. */
export const PROFILE_STORAGE_KEY = 'dragon-miner.profile.v1';
export const PROFILE_SCHEMA_VERSION = 11 as const;
/**
 * Schema ten used `strength` (health + physical damage) as a player attribute.
 * Schema eleven replaces it with `vitality` and adds `criticalDamage` and
 * `lifeSteal`, so the attribute key set changed and those profiles need the
 * migration below before `readAttributes` accepts them.
 */
export const PREVIOUS_CURRENT_PROFILE_SCHEMA_VERSION = 9 as const;
export const PREVIOUS_PROFILE_SCHEMA_VERSION = 8 as const;
/** Schema ten is the only one whose attributes still carried `strength`. */
export const STRENGTH_ATTRIBUTE_SCHEMA_VERSION = 10 as const;
export const PREVIOUS_PREVIOUS_PROFILE_SCHEMA_VERSION = 7 as const;
export const OLDER_PROFILE_SCHEMA_VERSION = 6 as const;
export const LEGACY_PROFILE_SCHEMA_VERSION = 5 as const;
export const OLDEST_PROFILE_SCHEMA_VERSION = 4 as const;
export const ANCIENT_PROFILE_SCHEMA_VERSION = 3 as const;
export const PRIMITIVE_PROFILE_SCHEMA_VERSION = 2 as const;
export const EARLIEST_PROFILE_SCHEMA_VERSION = 1 as const;

export type PersistedWarriorSkillId =
  | 'ataque_giratorio'
  | 'ataque_giratorio_2'
  | 'pulo_atacando'
  | 'triplo_ataque'
  | 'corte_duplo';

/**
 * Legacy equipment slots remain in this type for InventoryStore and older UI
 * adapters. New profile data also carries primaryWeapon/secondaryWeapon.
 */
export type RpgEquipmentSlot =
  | 'helmet'
  | 'chest'
  | 'gloves'
  | 'pants'
  | 'boots'
  | 'weapon';

export type CanonicalRpgEquipmentSlot =
  | 'helmet'
  | 'chest'
  | 'pants'
  | 'gloves'
  | 'boots'
  | 'secondaryWeapon'
  | 'primaryWeapon';

/**
 * A compatibility-shaped equipment record. The legacy `weapon` field is
 * intentionally retained while the canonical fields are introduced, so old
 * inventory systems can continue reading a migrated profile safely.
 */
export interface PlayerEquipment extends Record<RpgEquipmentSlot, string | null> {
  primaryWeapon?: string | null;
  secondaryWeapon?: string | null;
}

export interface InventoryStack {
  itemId: string;
  quantity: number;
}

/** Durable access window for the lobby blacksmith, stored as Unix milliseconds. */
export interface BlacksmithAccess {
  availableUntil: number | null;
}

export interface PlayerProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  /** Persisted number of accessible backpack stacks, expanded in five-slot steps. */
  backpackCapacity: number;
  /** Overflow from guaranteed boss rewards. It is retried automatically when space opens. */
  guildVault: InventoryStack[];
  /** Player-configurable desktop keyboard bindings for combat actions. */
  hotkeys: PlayerHotkeys;
  /** Opt-in automatic basic attack against the current marked target. */
  autoBasicAttack: boolean;
  /** Paid workshop access. A null timestamp means no active license. */
  blacksmith: BlacksmithAccess;
  skillStars: Record<PersistedWarriorSkillId, number>;
  progression: CharacterProgression;
  attributes: CharacterAttributes;
  /** Earned, unspent level-up points. */
  attributePointsRemaining: number;
  /** Retained as a false-only compatibility field while old saves migrate. */
  attributesConfirmed: false;
}

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProfileLoadResult {
  kind: 'missing' | 'loaded' | 'recovered';
  profile: PlayerProfile;
}

const LEGACY_EQUIPMENT_SLOTS: readonly RpgEquipmentSlot[] = [
  'helmet',
  'chest',
  'gloves',
  'pants',
  'boots',
  'weapon',
];

const CANONICAL_EQUIPMENT_SLOTS: readonly CanonicalRpgEquipmentSlot[] = [
  'helmet',
  'chest',
  'pants',
  'gloves',
  'boots',
  'secondaryWeapon',
  'primaryWeapon',
];

const SKILL_IDS = [
  'ataque_giratorio',
  'ataque_giratorio_2',
  'pulo_atacando',
  'triplo_ataque',
  'corte_duplo',
] as const satisfies readonly PersistedWarriorSkillId[];

function browserStorage(): StoragePort | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createDefaultPlayerProfile(): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: 'paladin',
    equipment: {
      helmet: null,
      chest: null,
      gloves: null,
      pants: null,
      boots: null,
      weapon: null,
      primaryWeapon: null,
      secondaryWeapon: null,
    },
    backpack: [{ itemId: 'starter-sword', quantity: 1 }],
    backpackCapacity: BACKPACK_INITIAL_CAPACITY,
    guildVault: [],
    hotkeys: { ...DEFAULT_PLAYER_HOTKEYS },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: {
      ataque_giratorio: 1,
      ataque_giratorio_2: 1,
      pulo_atacando: 1,
      triplo_ataque: 1,
      corte_duplo: 1,
    },
    progression: createInitialProgression(),
    attributes: createDefaultCharacterAttributes(),
    attributePointsRemaining: 0,
    attributesConfirmed: false,
  };
}

export function loadPlayerProfile(storage = browserStorage()): ProfileLoadResult {
  if (!storage) return { kind: 'missing', profile: createDefaultPlayerProfile() };

  let stored: string | null;
  try {
    stored = storage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return { kind: 'recovered', profile: createDefaultPlayerProfile() };
  }

  if (stored === null) {
    return { kind: 'missing', profile: createDefaultPlayerProfile() };
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isPlayerProfile(parsed)) return { kind: 'loaded', profile: parsed };
    if (isStrengthAttributeProfile(parsed)) {
      const migrated = migrateStrengthAttributeProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionNineProfile(parsed)) {
      const migrated = migrateVersionNineProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionEightProfile(parsed)) {
      const migrated = migrateVersionEightProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionSevenProfile(parsed)) {
      const migrated = migrateVersionSevenProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionSixProfile(parsed)) {
      const migrated = migrateVersionSixProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionFiveProfile(parsed)) {
      const migrated = migrateVersionFiveProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionFourProfile(parsed)) {
      const migrated = migrateVersionFourProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionThreeProfile(parsed)) {
      const migrated = migrateVersionThreeProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isVersionTwoProfile(parsed)) {
      const migrated = migrateVersionTwoProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    if (isLegacyPlayerProfile(parsed)) {
      const migrated = migrateLegacyProfile(parsed);
      savePlayerProfile(migrated, storage);
      return { kind: 'loaded', profile: migrated };
    }
    throw new Error('invalid profile');
  } catch {
    return { kind: 'recovered', profile: createDefaultPlayerProfile() };
  }
}

export function savePlayerProfile(
  profile: PlayerProfile,
  storage = browserStorage()
): boolean {
  if (!storage || !isPlayerProfile(profile)) return false;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/** Awards XP only for reportable chapter encounters and derives newly earned points. */
export function awardPlayerExperience(
  profile: PlayerProfile,
  role: ExperienceEncounterRole,
  wave = 1
): PlayerProfile {
  const award = awardExperience(profile.progression, role, wave);
  if (award.experienceGranted === 0) return profile;

  const totalAssigned = totalCharacterAttributePoints(profile.attributes);
  const totalEarned = (award.progression.level - 1) * 5;
  return {
    ...profile,
    progression: award.progression,
    attributePointsRemaining: Math.max(0, totalEarned - totalAssigned),
    attributesConfirmed: false,
  };
}

/** Clears only a completed expedition's progression, leaving durable loot intact. */
export function resetRunProgression(profile: PlayerProfile): PlayerProfile {
  return {
    ...profile,
    progression: createInitialProgression(),
    attributes: createDefaultCharacterAttributes(),
    attributePointsRemaining: 0,
    attributesConfirmed: false,
  };
}

/** Adds only earned points and enforces the shared 30-point specialization gate. */
export function allocateAttributePoint(
  profile: PlayerProfile,
  attribute: CharacterAttributeKey,
  amount = 1
): PlayerProfile {
  const available = attributeAllocationAllowance(
    profile.attributes,
    attribute,
    safePointCount(amount),
    profile.attributePointsRemaining
  );
  if (available === 0) return profile;

  const attributes = {
    ...profile.attributes,
    [attribute]: profile.attributes[attribute] + available,
  } as CharacterAttributes;
  return {
    ...profile,
    attributes,
    attributePointsRemaining: profile.attributePointsRemaining - available,
    attributesConfirmed: false,
  };
}

/** Respec is deliberately unavailable until the future paid reset system exists. */
export function removeAttributePoint(
  profile: PlayerProfile,
  _attribute: CharacterAttributeKey,
  _amount = 1
): PlayerProfile {
  return profile;
}

/** Respec is deliberately unavailable until the future paid reset system exists. */
export function resetAttributeAllocation(profile: PlayerProfile): PlayerProfile {
  return profile;
}

/** Legacy compatibility shim: allocations are no longer confirmed or locked. */
export function confirmAttributeAllocation(profile: PlayerProfile): PlayerProfile {
  return profile;
}

export function isAttributeAllocationComplete(profile: PlayerProfile): boolean {
  return totalCharacterAttributePoints(profile.attributes) === TOTAL_ATTRIBUTE_POINTS;
}

/** Reads the new primary slot and falls back to legacy weapon data for callers during migration. */
export function getPrimaryWeaponId(equipment: PlayerEquipment): string | null {
  return equipment.primaryWeapon ?? equipment.weapon ?? null;
}

export function getSecondaryWeaponId(equipment: PlayerEquipment): string | null {
  return equipment.secondaryWeapon ?? null;
}

function isPlayerProfile(value: unknown): value is PlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  const backpackCapacity = value.backpackCapacity;
  if (!isBackpackCapacity(backpackCapacity)) return false;
  if (!isBackpack(value.backpack, backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isPlayerHotkeys(value.hotkeys)) return false;
  if (typeof value.autoBasicAttack !== 'boolean') return false;
  if (!isBlacksmithAccess(value.blacksmith)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

/**
 * Schema ten is the last profile whose attributes carried `strength`. It is
 * detected by shape (every other field already matches the current schema) so
 * the attribute rework does not throw away an existing save.
 */
function isStrengthAttributeProfile(value: unknown): value is StrengthAttributePlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== STRENGTH_ATTRIBUTE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  const backpackCapacity = value.backpackCapacity;
  if (!isBackpackCapacity(backpackCapacity)) return false;
  if (!isBackpack(value.backpack, backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isPlayerHotkeys(value.hotkeys)) return false;
  if (typeof value.autoBasicAttack !== 'boolean') return false;
  if (!isBlacksmithAccess(value.blacksmith)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  if (!isProgression(progression)) return false;
  return readStrengthAttributes(value.attributes) !== undefined
    && hasStrengthAttributeAllocation(value, progression);
}

/** Legacy attribute object: same budget rules, `strength` instead of the new keys. */
function readStrengthAttributes(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  if (!hasExactKeys(value, LEGACY_ATTRIBUTE_KEYS)) return undefined;
  const attributes: Record<string, number> = {};
  for (const key of LEGACY_ATTRIBUTE_KEYS) {
    const raw = value[key];
    if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > TOTAL_ATTRIBUTE_POINTS) {
      return undefined;
    }
    attributes[key] = raw as number;
  }
  return attributes;
}

/**
 * Schema ten already spent only the points earned through progression, so the
 * legacy allocation has to satisfy the same rule the current schema enforces
 * (otherwise the migrated profile could not be written back).
 */
function hasStrengthAttributeAllocation(
  value: Record<string, unknown>,
  progression: CharacterProgression
): boolean {
  const attributes = readStrengthAttributes(value.attributes);
  if (!attributes) return false;
  const total = LEGACY_ATTRIBUTE_KEYS.reduce((sum, key) => sum + attributes[key], 0);
  const remaining = value.attributePointsRemaining;
  const earned = (progression.level - 1) * 5;
  if (!Number.isInteger(remaining) || remaining !== earned - total || (remaining as number) < 0) {
    return false;
  }
  return value.attributesConfirmed === false;
}

/** Schema nine predates an unequipped starter sword for new profiles. */
function isVersionNineProfile(value: unknown): value is VersionNinePlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== PREVIOUS_CURRENT_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpackCapacity(value.backpackCapacity) || !isBackpack(value.backpack, value.backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isPlayerHotkeys(value.hotkeys)) return false;
  if (typeof value.autoBasicAttack !== 'boolean') return false;
  if (!isBlacksmithAccess(value.blacksmith)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

/** Schema eight predates the persisted blacksmith access window. */
function isVersionEightProfile(value: unknown): value is VersionEightPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== PREVIOUS_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpackCapacity(value.backpackCapacity) || !isBackpack(value.backpack, value.backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault) || !isPlayerHotkeys(value.hotkeys) || !isSkillStars(value.skillStars)) return false;
  if (typeof value.autoBasicAttack !== 'boolean') return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

/** Schema seven still exposed a keyboard binding for the basic mouse attack. */
function isVersionSevenProfile(value: unknown): value is VersionSevenPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== PREVIOUS_PREVIOUS_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpackCapacity(value.backpackCapacity) || !isBackpack(value.backpack, value.backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault) || !isSkillStars(value.skillStars) || !isVersionSevenHotkeys(value.hotkeys)) return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

function isVersionSevenHotkeys(value: unknown): value is Record<'ataque_basico' | PersistedWarriorSkillId, string> {
  if (!isRecord(value)) return false;
  const keys = ['ataque_basico', 'ataque_giratorio', 'ataque_giratorio_2', 'pulo_atacando', 'triplo_ataque', 'corte_duplo'];
  return Object.keys(value).length === keys.length
    && keys.every((key) => typeof value[key] === 'string' && value[key].length > 0);
}

/** Schema six had capacity expansion but predates configurable combat hotkeys. */
function isVersionSixProfile(value: unknown): value is VersionSixPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== OLDER_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpackCapacity(value.backpackCapacity) || !isBackpack(value.backpack, value.backpackCapacity)) return false;
  if (!isGuildVault(value.guildVault) || !isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

/** Schema five used the current progression system but had a fixed backpack size. */
function isVersionFiveProfile(value: unknown): value is VersionFivePlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== LEGACY_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpack(value.backpack, migratedBackpackCapacity(value))) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  return isProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

/** Schema four used the former fixed 100-XP level rule. */
function isVersionFourProfile(value: unknown): value is VersionFourPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== OLDEST_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isBackpack(value.backpack, migratedBackpackCapacity(value))) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  const progression = value.progression;
  return isVersionFourProgression(progression) && isCurrentAttributeAllocation(value, progression);
}

function isVersionThreeProfile(value: unknown): value is VersionThreePlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== ANCIENT_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isLegacyBackpack(value.backpack)) return false;
  if (!isGuildVault(value.guildVault)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  return isLegacyAttributeAllocation(value);
}

function isVersionTwoProfile(value: unknown): value is VersionTwoPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== PRIMITIVE_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isCanonicalEquipment(value.equipment)) return false;
  if (!isLegacyBackpack(value.backpack)) return false;
  if (!isSkillStars(value.skillStars)) return false;
  return isLegacyAttributeAllocation(value);
}

function isLegacyPlayerProfile(value: unknown): value is LegacyPlayerProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== EARLIEST_PROFILE_SCHEMA_VERSION) return false;
  if (value.selectedClass !== 'paladin') return false;
  if (!isLegacyEquipment(value.equipment)) return false;
  if (!isLegacyBackpack(value.backpack)) return false;
  return isSkillStars(value.skillStars);
}

function isCanonicalEquipment(value: unknown): value is PlayerEquipment {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  const hasCanonicalKeys = CANONICAL_EQUIPMENT_SLOTS.every((slot) => keys.includes(slot));
  const onlyAllowedExtras = keys.every(
    (key) => CANONICAL_EQUIPMENT_SLOTS.includes(key as CanonicalRpgEquipmentSlot) || key === 'weapon'
  );
  if (!hasCanonicalKeys || !onlyAllowedExtras) return false;
  if (value.secondaryWeapon !== null) return false;

  for (const slot of CANONICAL_EQUIPMENT_SLOTS) {
    if (!isEquipmentItemForSlot(value[slot], slot)) return false;
  }
  if ('weapon' in value) {
    const legacyWeapon = value.weapon;
    if (!isEquipmentItemForSlot(legacyWeapon, 'weapon')) return false;
    if (legacyWeapon !== value.primaryWeapon) return false;
  }
  return true;
}

function isLegacyEquipment(value: unknown): value is Record<RpgEquipmentSlot, string | null> {
  if (!isRecord(value) || !hasExactKeys(value, LEGACY_EQUIPMENT_SLOTS)) return false;
  for (const slot of LEGACY_EQUIPMENT_SLOTS) {
    if (!isEquipmentItemForSlot(value[slot], slot)) return false;
  }
  return true;
}

function isEquipmentItemForSlot(
  itemId: unknown,
  slot: CanonicalRpgEquipmentSlot | RpgEquipmentSlot
): boolean {
  if (itemId === null) return true;
  if (typeof itemId !== 'string' || itemId.length === 0) return false;
  const item = getInventoryItem(itemId);
  if (!item || item.kind !== 'equipment') return false;
  const itemSlot = item.slot as string | undefined;
  if (slot === 'primaryWeapon' || slot === 'secondaryWeapon') {
    return itemSlot === 'weapon' || itemSlot === slot;
  }
  if (slot === 'weapon') return itemSlot === 'weapon';
  return itemSlot === slot;
}

function isBackpack(value: unknown, capacity = BACKPACK_INITIAL_CAPACITY): value is InventoryStack[] {
  if (!Array.isArray(value) || value.length > capacity) return false;
  return areValidStacks(value, true);
}

function isLegacyBackpack(value: unknown): value is InventoryStack[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  return areValidStacks(value, true);
}

function isGuildVault(value: unknown): value is InventoryStack[] {
  if (!Array.isArray(value)) return false;
  return areValidStacks(value, false);
}

function isBlacksmithAccess(value: unknown): value is BlacksmithAccess {
  if (!isRecord(value) || !hasExactKeys(value, ['availableUntil'])) return false;
  return value.availableUntil === null
    || (Number.isSafeInteger(value.availableUntil) && (value.availableUntil as number) >= 0);
}

function areValidStacks(
  value: unknown[],
  respectStackLimit: boolean,
  materialsOnly = false
): value is InventoryStack[] {
  const itemIds = new Set<string>();
  for (const stack of value) {
    if (!isRecord(stack)) return false;
    if (typeof stack.itemId !== 'string' || stack.itemId.length === 0) return false;
    if (!Number.isInteger(stack.quantity) || (stack.quantity as number) <= 0) return false;
    const item = getInventoryItem(stack.itemId);
    if (!item || (materialsOnly && item.kind !== 'material')) return false;
    if (respectStackLimit && (stack.quantity as number) > item.maxStack) return false;
    if (itemIds.has(stack.itemId)) return false;
    itemIds.add(stack.itemId);
  }
  return true;
}

function isSkillStars(value: unknown): value is Record<PersistedWarriorSkillId, number> {
  if (!isRecord(value) || !hasExactKeys(value, SKILL_IDS)) return false;
  for (const skillId of SKILL_IDS) {
    const stars = value[skillId];
    if (!Number.isInteger(stars) || (stars as number) < 1 || (stars as number) > 5) return false;
  }
  return true;
}

function isProgression(value: unknown): value is CharacterProgression {
  if (!isRecord(value) || !hasExactKeys(value, ['level', 'experience'])) return false;
  if (!Number.isInteger(value.level) || !Number.isInteger(value.experience)) return false;
  const normalized = normalizeProgression(value);
  return normalized.level === value.level && normalized.experience === value.experience;
}

function isVersionFourProgression(value: unknown): value is CharacterProgression {
  if (!isRecord(value) || !hasExactKeys(value, ['level', 'experience'])) return false;
  if (!Number.isInteger(value.level) || !Number.isInteger(value.experience)) return false;
  const experience = value.experience as number;
  const expectedLevel = Math.min(21, 1 + Math.floor(experience / 100));
  return experience >= 0 && experience <= 2000 && value.level === expectedLevel;
}

function isCurrentAttributeAllocation(
  value: Record<string, unknown>,
  progression: CharacterProgression
): boolean {
  const attributes = readAttributes(value.attributes);
  if (!attributes) return false;
  const total = totalCharacterAttributePoints(attributes);
  const remaining = value.attributePointsRemaining;
  const earned = (progression.level - 1) * 5;
  if (!Number.isInteger(remaining) || remaining !== earned - total || (remaining as number) < 0) {
    return false;
  }
  return value.attributesConfirmed === false;
}

function isLegacyAttributeAllocation(value: Record<string, unknown>): boolean {
  // Versions before schema eleven carried `strength`, so this reader must not
  // use the current key set.
  const attributes = readStrengthAttributes(value.attributes);
  if (!attributes) return false;
  const total = LEGACY_ATTRIBUTE_KEYS.reduce((sum, key) => sum + attributes[key], 0);
  const remaining = value.attributePointsRemaining;
  if (!Number.isInteger(remaining) || remaining !== TOTAL_ATTRIBUTE_POINTS - total) return false;
  if (typeof value.attributesConfirmed !== 'boolean') return false;
  return !value.attributesConfirmed || (total === TOTAL_ATTRIBUTE_POINTS && remaining === 0);
}

function readAttributes(value: unknown): CharacterAttributes | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ATTRIBUTE_KEYS)) return undefined;
  const attributes = normalizeCharacterAttributes(value);
  for (const key of ATTRIBUTE_KEYS) {
    const raw = value[key];
    if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > TOTAL_ATTRIBUTE_POINTS) {
      return undefined;
    }
    if (attributes[key] !== raw) return undefined;
  }
  return attributes;
}

function migrateLegacyProfile(legacy: LegacyPlayerProfile): PlayerProfile {
  const primaryWeapon = legacy.equipment.weapon;
  return makeProgressionProfile({
    selectedClass: legacy.selectedClass,
    equipment: {
      helmet: legacy.equipment.helmet,
      chest: legacy.equipment.chest,
      gloves: legacy.equipment.gloves,
      pants: legacy.equipment.pants,
      boots: legacy.equipment.boots,
      weapon: primaryWeapon,
      primaryWeapon,
      secondaryWeapon: null,
    },
    backpack: legacy.backpack,
    backpackCapacity: migratedBackpackCapacity(legacy),
    guildVault: [],
    skillStars: legacy.skillStars,
  });
}

function migrateVersionTwoProfile(previous: VersionTwoPlayerProfile): PlayerProfile {
  return makeProgressionProfile({
    selectedClass: previous.selectedClass,
    equipment: previous.equipment,
    backpack: previous.backpack,
    backpackCapacity: migratedBackpackCapacity(previous),
    guildVault: [],
    skillStars: previous.skillStars,
  });
}

function migrateVersionThreeProfile(previous: VersionThreePlayerProfile): PlayerProfile {
  return makeProgressionProfile({
    selectedClass: previous.selectedClass,
    equipment: previous.equipment,
    backpack: previous.backpack,
    backpackCapacity: migratedBackpackCapacity(previous),
    guildVault: previous.guildVault,
    skillStars: previous.skillStars,
  });
}

function migrateVersionFourProfile(previous: VersionFourPlayerProfile): PlayerProfile {
  const progression = migrateVersionFourProgression(previous.progression);
  const backpackCapacity = migratedBackpackCapacity(previous);
  const inventory = migrateInventoryCapacity(previous.backpack, previous.guildVault, backpackCapacity);
  const totalAssigned = totalCharacterAttributePoints(previous.attributes);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: previous.selectedClass,
    equipment: { ...previous.equipment },
    backpack: inventory.backpack,
    backpackCapacity,
    guildVault: inventory.guildVault,
    hotkeys: { ...DEFAULT_PLAYER_HOTKEYS },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: { ...previous.skillStars },
    progression,
    attributes: { ...previous.attributes },
    attributePointsRemaining: Math.max(0, (progression.level - 1) * 5 - totalAssigned),
    attributesConfirmed: false,
  };
}

function migrateVersionFiveProfile(previous: VersionFivePlayerProfile): PlayerProfile {
  const backpackCapacity = migratedBackpackCapacity(previous);
  const inventory = migrateInventoryCapacity(previous.backpack, previous.guildVault, backpackCapacity);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: previous.selectedClass,
    equipment: { ...previous.equipment },
    backpack: inventory.backpack,
    backpackCapacity,
    guildVault: inventory.guildVault,
    hotkeys: { ...DEFAULT_PLAYER_HOTKEYS },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: { ...previous.skillStars },
    progression: { ...previous.progression },
    attributes: { ...previous.attributes },
    attributePointsRemaining: previous.attributePointsRemaining,
    attributesConfirmed: false,
  };
}

function migrateVersionSixProfile(previous: VersionSixPlayerProfile): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: previous.selectedClass,
    equipment: { ...previous.equipment },
    backpack: previous.backpack.map((stack) => ({ ...stack })),
    backpackCapacity: previous.backpackCapacity,
    guildVault: previous.guildVault.map((stack) => ({ ...stack })),
    hotkeys: { ...DEFAULT_PLAYER_HOTKEYS },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: { ...previous.skillStars },
    progression: { ...previous.progression },
    attributes: { ...previous.attributes },
    attributePointsRemaining: previous.attributePointsRemaining,
    attributesConfirmed: false,
  };
}

function migrateVersionSevenProfile(previous: VersionSevenPlayerProfile): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: previous.selectedClass,
    equipment: { ...previous.equipment },
    backpack: previous.backpack.map((stack) => ({ ...stack })),
    backpackCapacity: previous.backpackCapacity,
    guildVault: previous.guildVault.map((stack) => ({ ...stack })),
    hotkeys: {
      ataque_giratorio: previous.hotkeys.ataque_giratorio,
      ataque_giratorio_2: previous.hotkeys.ataque_giratorio_2,
      pulo_atacando: previous.hotkeys.pulo_atacando,
      triplo_ataque: previous.hotkeys.triplo_ataque,
      corte_duplo: previous.hotkeys.corte_duplo,
    },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: { ...previous.skillStars },
    progression: { ...previous.progression },
    attributes: { ...previous.attributes },
    attributePointsRemaining: previous.attributePointsRemaining,
    attributesConfirmed: false,
  };
}

function migrateVersionEightProfile(previous: VersionEightPlayerProfile): PlayerProfile {
  return {
    ...previous,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    blacksmith: { availableUntil: null },
  };
}

/**
 * Carries a save forward through the attribute rework: Strength becomes
 * Vitality point for point (health was already its job) and the two new
 * attributes start at zero. The invested budget is preserved, so the player
 * keeps every point they already spent.
 */
function migrateStrengthAttributeProfile(previous: StrengthAttributePlayerProfile): PlayerProfile {
  const legacy = previous.attributes;
  const attributes: CharacterAttributes = {
    ...createDefaultCharacterAttributes(),
    vitality: legacy.strength,
    attack: legacy.attack,
    defense: legacy.defense,
    agility: legacy.agility,
    criticalAttack: legacy.criticalAttack,
    criticalMagic: legacy.criticalMagic,
    dodge: legacy.dodge,
  };
  return {
    ...previous,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    attributes,
    attributesConfirmed: false,
    equipment: { ...previous.equipment },
    backpack: previous.backpack.map((stack) => ({ ...stack })),
    guildVault: previous.guildVault.map((stack) => ({ ...stack })),
  };
}

function migrateVersionNineProfile(previous: VersionNinePlayerProfile): PlayerProfile {
  return {
    ...previous,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    equipment: { ...previous.equipment },
    backpack: previous.backpack.map((stack) => ({ ...stack })),
    guildVault: previous.guildVault.map((stack) => ({ ...stack })),
  };
}

function migrateVersionFourProgression(previous: CharacterProgression): CharacterProgression {
  if (previous.level >= 21) {
    return normalizeProgression({ experience: experienceAtLevelStart(21) });
  }
  const oldLevelStart = (previous.level - 1) * 100;
  const oldFraction = Math.max(0, Math.min(1, (previous.experience - oldLevelStart) / 100));
  const newExperience = experienceAtLevelStart(previous.level)
    + Math.round(experienceRequiredForLevel(previous.level) * oldFraction);
  return normalizeProgression({ experience: newExperience });
}

function makeProgressionProfile(source: {
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  backpackCapacity: number;
  guildVault: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
}): PlayerProfile {
  const inventory = migrateInventoryCapacity(
    source.backpack,
    source.guildVault,
    source.backpackCapacity
  );
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    selectedClass: source.selectedClass,
    equipment: { ...source.equipment },
    backpack: inventory.backpack,
    backpackCapacity: source.backpackCapacity,
    guildVault: inventory.guildVault,
    hotkeys: { ...DEFAULT_PLAYER_HOTKEYS },
    autoBasicAttack: false,
    blacksmith: { availableUntil: null },
    skillStars: { ...source.skillStars },
    progression: createInitialProgression(),
    attributes: createDefaultCharacterAttributes(),
    attributePointsRemaining: 0,
    attributesConfirmed: false,
  };
}

/**
 * Older saves had thirty bag slots. Preserve ordering through the migrated
 * capacity and move only overflow stacks into the durable Guild Vault.
 */
function migrateInventoryCapacity(
  backpack: readonly InventoryStack[],
  existingGuildVault: readonly InventoryStack[],
  backpackCapacity: number
): Pick<PlayerProfile, 'backpack' | 'guildVault'> {
  const retained = backpack.slice(0, backpackCapacity).map((stack) => ({ ...stack }));
  const guildVault = existingGuildVault.map((stack) => ({ ...stack }));
  for (const stack of backpack.slice(backpackCapacity)) {
    appendVaultStack(guildVault, stack);
  }
  return { backpack: retained, guildVault };
}

function migratedBackpackCapacity(profile: object): number {
  return normalizeBackpackCapacity((profile as Record<string, unknown>).backpackCapacity);
}

function appendVaultStack(vault: InventoryStack[], incoming: InventoryStack): void {
  const existing = vault.find((stack) => stack.itemId === incoming.itemId);
  if (existing) existing.quantity += incoming.quantity;
  else vault.push({ ...incoming });
}

interface LegacyPlayerProfile {
  schemaVersion: typeof EARLIEST_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: Record<RpgEquipmentSlot, string | null>;
  backpack: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
}

interface VersionTwoPlayerProfile {
  schemaVersion: typeof PRIMITIVE_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
  attributes: CharacterAttributes;
  attributePointsRemaining: number;
  attributesConfirmed: boolean;
}

interface VersionThreePlayerProfile {
  schemaVersion: typeof ANCIENT_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  guildVault: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
  attributes: CharacterAttributes;
  attributePointsRemaining: number;
  attributesConfirmed: boolean;
}

interface VersionFourPlayerProfile {
  schemaVersion: typeof OLDEST_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  guildVault: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
  progression: CharacterProgression;
  attributes: CharacterAttributes;
  attributePointsRemaining: number;
  attributesConfirmed: false;
}

interface VersionFivePlayerProfile {
  schemaVersion: typeof LEGACY_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  guildVault: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
  progression: CharacterProgression;
  attributes: CharacterAttributes;
  attributePointsRemaining: number;
  attributesConfirmed: false;
}

interface VersionSixPlayerProfile {
  schemaVersion: typeof OLDER_PROFILE_SCHEMA_VERSION;
  selectedClass: 'paladin';
  equipment: PlayerEquipment;
  backpack: InventoryStack[];
  backpackCapacity: number;
  guildVault: InventoryStack[];
  skillStars: Record<PersistedWarriorSkillId, number>;
  progression: CharacterProgression;
  attributes: CharacterAttributes;
  attributePointsRemaining: number;
  attributesConfirmed: false;
}

interface VersionSevenPlayerProfile extends Omit<PlayerProfile, 'schemaVersion' | 'hotkeys' | 'autoBasicAttack'> {
  schemaVersion: typeof PREVIOUS_PREVIOUS_PROFILE_SCHEMA_VERSION;
  hotkeys: Record<'ataque_basico' | PersistedWarriorSkillId, string>;
}

interface VersionEightPlayerProfile extends Omit<PlayerProfile, 'schemaVersion' | 'blacksmith'> {
  schemaVersion: typeof PREVIOUS_PROFILE_SCHEMA_VERSION;
}

interface VersionNinePlayerProfile extends Omit<PlayerProfile, 'schemaVersion'> {
  schemaVersion: typeof PREVIOUS_CURRENT_PROFILE_SCHEMA_VERSION;
}

interface StrengthAttributePlayerProfile extends Omit<PlayerProfile, 'schemaVersion' | 'attributes'> {
  schemaVersion: typeof STRENGTH_ATTRIBUTE_SCHEMA_VERSION;
  attributes: Record<(typeof LEGACY_ATTRIBUTE_KEYS)[number], number>;
}

/** Attribute keys accepted by schema ten and older. */
const LEGACY_ATTRIBUTE_KEYS = [
  'strength',
  'attack',
  'defense',
  'agility',
  'criticalAttack',
  'criticalMagic',
  'dodge',
] as const;

function safePointCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}
