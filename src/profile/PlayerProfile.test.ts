import { describe, expect, it } from 'vitest';
import { INVENTORY_ITEMS } from '../inventory/InventoryCatalog';
import {
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORAGE_KEY,
  allocateAttributePoint,
  awardPlayerExperience,
  createDefaultPlayerProfile,
  loadPlayerProfile,
  savePlayerProfile,
  resetRunProgression,
  type StoragePort,
} from './PlayerProfile';

function memoryStorage(initial: string | null = null): StoragePort & { value: string | null } {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

function versionThreeProfile(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    selectedClass: 'paladin',
    equipment: {
      helmet: null,
      chest: null,
      gloves: null,
      pants: null,
      boots: null,
      weapon: 'starter-sword',
      primaryWeapon: 'starter-sword',
      secondaryWeapon: null,
    },
    backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
    guildVault: [{ itemId: 'guild-token', quantity: 1 }],
    skillStars: {
      ataque_giratorio: 2,
      ataque_giratorio_2: 1,
      pulo_atacando: 3,
      triplo_ataque: 4,
      corte_duplo: 5,
    },
    attributes: {
      strength: 40,
      attack: 20,
      defense: 0,
      agility: 0,
      criticalAttack: 0,
      criticalMagic: 0,
      dodge: 0,
    },
    attributePointsRemaining: 40,
    attributesConfirmed: false,
  };
}

describe('PlayerProfile progression', () => {
  it('creates a level-one Warrior with zero attributes and no free points', () => {
    const profile = createDefaultPlayerProfile();

    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(profile.backpackCapacity).toBe(20);
    expect(profile.equipment.weapon).toBeNull();
    expect(profile.equipment.primaryWeapon).toBeNull();
    expect(profile.equipment.secondaryWeapon).toBeNull();
    expect(profile.backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
    expect(profile.progression).toEqual({ level: 1, experience: 0 });
    expect(profile.attributes).toEqual({
      vitality: 0,
      attack: 0,
      defense: 0,
      agility: 0,
      criticalAttack: 0,
      criticalDamage: 0,
      criticalMagic: 0,
      lifeSteal: 0,
      dodge: 0,
    });
    expect(profile.attributePointsRemaining).toBe(0);
    expect(profile.hotkeys).not.toHaveProperty('ataque_basico');
    expect(profile.autoBasicAttack).toBe(false);
    expect(profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('resets only run progression while preserving equipped gear and stored inventory', () => {
    const profile = createDefaultPlayerProfile();
    profile.equipment.chest = 'iron-chestplate';
    profile.backpack.push({ itemId: 'runic-crystal', quantity: 7 });
    profile.guildVault.push({ itemId: 'guild-token', quantity: 3 });
    profile.progression = { level: 3, experience: 270 };
    profile.attributes = {
      vitality: 10,
      attack: 5,
      defense: 4,
      agility: 3,
      criticalAttack: 2,
      criticalDamage: 1,
      criticalMagic: 1,
      lifeSteal: 1,
      dodge: 1,
    };
    profile.attributePointsRemaining = 6;

    const reset = resetRunProgression(profile);

    expect(reset.progression).toEqual({ level: 1, experience: 0 });
    expect(reset.attributes).toEqual(createDefaultPlayerProfile().attributes);
    expect(reset.attributePointsRemaining).toBe(0);
    expect(reset.equipment).toEqual(profile.equipment);
    expect(reset.backpack).toEqual(profile.backpack);
    expect(reset.backpackCapacity).toBe(profile.backpackCapacity);
    expect(reset.guildVault).toEqual(profile.guildVault);
    expect(reset.blacksmith).toEqual(profile.blacksmith);
  });

  it('migrates a version-three save safely while resetting its legacy pre-match allocation', () => {
    const legacy = versionThreeProfile();
    const storage = memoryStorage(JSON.stringify(legacy));
    const result = loadPlayerProfile(storage);

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.equipment.primaryWeapon).toBe('starter-sword');
    expect(result.profile.backpack).toEqual([{ itemId: 'runic-crystal', quantity: 7 }]);
    expect(result.profile.guildVault).toEqual([{ itemId: 'guild-token', quantity: 1 }]);
    expect(result.profile.skillStars.ataque_giratorio).toBe(2);
    expect(result.profile.attributes).toEqual(createDefaultPlayerProfile().attributes);
    expect(result.profile.attributePointsRemaining).toBe(0);
    expect(result.profile.progression).toEqual({ level: 1, experience: 0 });
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
    expect(JSON.parse(storage.value!).schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
  });

  it('migrates a schema-ten save from strength into vitality without losing its build', () => {
    // Level five earns eight points, so a fully spent schema-ten build has
    // exactly the same budget the current schema expects.
    const schemaTen = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 10,
      progression: { level: 5, experience: 400 },
      attributes: {
        strength: 3,
        attack: 2,
        defense: 1,
        agility: 1,
        criticalAttack: 1,
        criticalMagic: 0,
        dodge: 0,
      },
      attributePointsRemaining: 0,
    };
    const storage = memoryStorage(JSON.stringify(schemaTen));
    const result = loadPlayerProfile(storage);

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    // Strength points become vitality point for point; the two new attributes
    // start at zero so the allocation stays inside the shared budget.
    expect(result.profile.attributes).toEqual({
      vitality: 3,
      attack: 2,
      defense: 1,
      agility: 1,
      criticalAttack: 1,
      criticalDamage: 0,
      criticalMagic: 0,
      lifeSteal: 0,
      dodge: 0,
    });
    expect(result.profile.attributePointsRemaining).toBe(0);
    expect(JSON.parse(storage.value!).schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
  });

  it('moves legacy backpack overflow into the Guild Vault without losing equipment', () => {
    const legacy = versionThreeProfile();
    // Items the legacy save could not have known (schema ten essences and the
    // Predador/Muralha set pieces); the legacy backpack guard only accepts
    // thirty stacks, so the fixture stays inside the pre-overflow catalog.
    const postLegacyCatalogAdditions = new Set([
      'volatile-draconic-essence',
      'ossified-draco-ribs',
      'verdant-draco-talisman',
      'crimson-draco-talon',
      'obsidian-draco-eye',
      // The Maga starter and her forged line postdate the legacy schema too.
      'starter-staff',
      ...['helmet', 'chest', 'pants', 'gloves', 'boots'].flatMap((slot) => [
        `predator-forged-${slot}`,
        `bulwark-forged-${slot}`,
        // The offensive forged line postdates the legacy schema too.
        `common-forged-${slot}-atk`,
        `maga-forged-${slot}`,
        `maga-forged-${slot}-atk`,
      ]),
    ]);
    const itemIds = [
      ...Object.keys(INVENTORY_ITEMS).filter(
        (itemId) => itemId !== 'starter-sword' && !postLegacyCatalogAdditions.has(itemId)
      ),
      'starter-sword',
    ];
    legacy.backpack = itemIds.map((itemId) => ({ itemId, quantity: 1 }));
    legacy.guildVault = [];
    const storage = memoryStorage(JSON.stringify(legacy));

    const result = loadPlayerProfile(storage);

    expect(result.profile.backpack).toHaveLength(20);
    expect(result.profile.guildVault).toHaveLength(itemIds.length - 20);
    expect(
      [...result.profile.backpack, ...result.profile.guildVault]
        .map(({ itemId }) => itemId)
        .sort()
    ).toEqual(itemIds.sort());
    expect(JSON.parse(storage.value!).backpack).toHaveLength(20);
  });

  it('grants two points after the new early-wave level threshold', () => {
    let profile = createDefaultPlayerProfile();
    for (let index = 0; index < 5; index += 1) {
      profile = awardPlayerExperience(profile, 'regular', 1);
    }

    expect(profile.progression).toEqual({ level: 2, experience: 60 });
    expect(profile.attributePointsRemaining).toBe(2);
  });

  it('migrates a schema-four save without losing its earned level or inventory', () => {
    const current = createDefaultPlayerProfile();
    const oldProfile = {
      ...current,
      schemaVersion: 4,
      progression: { level: 2, experience: 150 },
      attributePointsRemaining: 2,
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
    };
    const result = loadPlayerProfile(memoryStorage(JSON.stringify(oldProfile)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.progression).toEqual({ level: 2, experience: 100 });
    expect(result.profile.attributePointsRemaining).toBe(2);
    expect(result.profile.backpack).toEqual([{ itemId: 'runic-crystal', quantity: 7 }]);
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('migrates a schema-five save without moving backpack or Guild Vault stacks', () => {
    const current = createDefaultPlayerProfile();
    const versionFive: Record<string, unknown> = {
      ...current,
      schemaVersion: 5,
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
      guildVault: [{ itemId: 'guild-token', quantity: 30 }],
    };
    delete versionFive.backpackCapacity;

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(versionFive)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.backpackCapacity).toBe(20);
    expect(result.profile.backpack).toEqual([{ itemId: 'runic-crystal', quantity: 7 }]);
    expect(result.profile.guildVault).toEqual([{ itemId: 'guild-token', quantity: 30 }]);
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('migrates a schema-six save by giving it skill bindings and disabled basic auto-attack', () => {
    const schemaSix: Record<string, unknown> = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 6,
    };
    delete schemaSix.hotkeys;

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(schemaSix)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.hotkeys).toEqual({
      ataque_giratorio: '1',
      ataque_giratorio_2: '2',
      pulo_atacando: '3',
      triplo_ataque: '4',
      corte_duplo: '5',
    });
    expect(result.profile.autoBasicAttack).toBe(false);
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('migrates a schema-seven profile by removing the retired basic-attack hotkey', () => {
    const schemaSeven: Record<string, unknown> = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 7,
      hotkeys: {
        ataque_basico: 'f',
        ataque_giratorio: '1',
        ataque_giratorio_2: '2',
        pulo_atacando: '3',
        triplo_ataque: '4',
        corte_duplo: '5',
      },
    };

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(schemaSeven)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.autoBasicAttack).toBe(false);
    expect(result.profile.hotkeys).not.toHaveProperty('ataque_basico');
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('migrates a schema-eight profile by adding an inactive blacksmith license', () => {
    const schemaEight: Record<string, unknown> = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 8,
    };
    delete schemaEight.blacksmith;

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(schemaEight)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('migrates a schema-nine profile without altering earned equipment or backpack stacks', () => {
    const schemaNine: Record<string, unknown> = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 9,
      equipment: {
        ...createDefaultPlayerProfile().equipment,
        weapon: 'starter-sword',
        primaryWeapon: 'starter-sword',
      },
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
    };

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(schemaNine)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.equipment.primaryWeapon).toBe('starter-sword');
    expect(result.profile.backpack).toEqual([{ itemId: 'runic-crystal', quantity: 7 }]);
  });

  it('migrates schema-one and schema-two saves with an inactive blacksmith license', () => {
    const current = createDefaultPlayerProfile();
    const schemaOne: Record<string, unknown> = {
      schemaVersion: 1,
      selectedClass: current.selectedClass,
      equipment: {
        helmet: null,
        chest: null,
        gloves: null,
        pants: null,
        boots: null,
        weapon: 'starter-sword',
      },
      backpack: [],
      skillStars: current.skillStars,
    };
    const schemaTwo: Record<string, unknown> = {
      schemaVersion: 2,
      selectedClass: current.selectedClass,
      equipment: current.equipment,
      backpack: [],
      skillStars: current.skillStars,
      attributes: current.attributes,
      attributePointsRemaining: 40,
      attributesConfirmed: false,
    };

    expect(loadPlayerProfile(memoryStorage(JSON.stringify(schemaOne))).profile.blacksmith).toEqual({ availableUntil: null });
    expect(loadPlayerProfile(memoryStorage(JSON.stringify(schemaTwo))).profile.blacksmith).toEqual({ availableUntil: null });
  });

  it('normalizes a migrated backpack capacity to the nearest valid five-slot step', () => {
    const versionFive: Record<string, unknown> = {
      ...createDefaultPlayerProfile(),
      schemaVersion: 5,
      backpackCapacity: 48,
    };

    const result = loadPlayerProfile(memoryStorage(JSON.stringify(versionFive)));

    expect(result.kind).toBe('loaded');
    expect(result.profile.backpackCapacity).toBe(50);
  });

  it('recovers instead of loading a current profile with a non-expandable capacity', () => {
    const malformed = { ...createDefaultPlayerProfile(), backpackCapacity: 23 };

    expect(loadPlayerProfile(memoryStorage(JSON.stringify(malformed))).kind).toBe('recovered');
  });

  it('enforces gate progression: initial cap 10, unlocks +5 up to 15 when another reaches 10', () => {
    let profile = { ...createDefaultPlayerProfile(), attributePointsRemaining: 40 };
    profile = allocateAttributePoint(profile, 'attack', 8);
    profile = allocateAttributePoint(profile, 'attack', 5);

    expect(profile.attributes.attack).toBe(10);
    expect(profile.attributePointsRemaining).toBe(30);
    expect(allocateAttributePoint(profile, 'attack', 5)).toEqual(profile);

    profile = allocateAttributePoint(profile, 'defense', 10);
    profile = allocateAttributePoint(profile, 'attack', 5);
    expect(profile.attributes.attack).toBe(15);
    expect(profile.attributes.defense).toBe(10);
  });

  it('saves and loads the selected Mage class in the current profile schema', () => {
    const profile = createDefaultPlayerProfile();
    profile.selectedClass = 'mage';
    const storage = memoryStorage();

    expect(savePlayerProfile(profile, storage)).toBe(true);
    expect(loadPlayerProfile(storage)).toEqual({ kind: 'loaded', profile });
  });

  it('loads a valid current profile and safely recovers malformed progression data', () => {
    const expected = createDefaultPlayerProfile();
    expected.backpack.push({ itemId: 'runic-crystal', quantity: 7 });
    expect(loadPlayerProfile(memoryStorage(JSON.stringify(expected)))).toEqual({
      kind: 'loaded',
      profile: expected,
    });

    const malformed = { ...createDefaultPlayerProfile(), progression: { level: 999, experience: 1 } };
    const recovered = loadPlayerProfile(memoryStorage(JSON.stringify(malformed)));
    expect(recovered.kind).toBe('recovered');
    expect(recovered.profile).toEqual(createDefaultPlayerProfile());
  });

  it('returns false instead of throwing when persistence is unavailable and keeps the stable key', () => {
    let usedKey = '';
    const storage: StoragePort = {
      getItem: () => null,
      setItem: (key) => {
        usedKey = key;
        throw new Error('quota');
      },
    };

    expect(savePlayerProfile(createDefaultPlayerProfile(), storage)).toBe(false);
    expect(usedKey).toBe(PROFILE_STORAGE_KEY);
    expect(PROFILE_STORAGE_KEY).toBe('dragon-miner.profile.v1');
  });
});
