/**
 * The workshop sells every armor slot in two craft lines: an offensive one and
 * a defensive one. The line is a first-class concept because it changes three
 * things at once - the material cost, the output item and the stat spread of
 * the whole set - so it lives in its own module instead of being derived from
 * an id suffix in each surface.
 */
export type CraftLineId = 'attack' | 'defense';

export interface CraftLine {
  readonly id: CraftLineId;
  /** Full name used by the workshop dropdown. */
  readonly label: string;
  /** Short tag printed on recipe cards, tooltips and item labels. */
  readonly tag: string;
  /** Units of *each* material a recipe of this line consumes. */
  readonly materialCost: number;
  /** What the whole set leans on, shown under the dropdown. */
  readonly focus: string;
  /** Attribute the five-piece bonus leans on. */
  readonly focusAttribute: string;
}

/**
 * `attack` is listed first because it is the expensive line (15 of each
 * material against the defensive line's 10) and the dropdown opens on it.
 */
export const CRAFT_LINES: readonly CraftLine[] = [
  {
    id: 'attack',
    label: 'Equipamentos ATK',
    tag: 'ATK',
    materialCost: 15,
    focus: 'Ataque em todas as peças do conjunto.',
    focusAttribute: 'Ataque',
  },
  {
    id: 'defense',
    label: 'Equipamentos DEF',
    tag: 'DEF',
    materialCost: 10,
    focus: 'Defesa em todas as peças do conjunto.',
    focusAttribute: 'Defesa',
  },
] as const;

export const CRAFT_LINE_IDS: readonly CraftLineId[] = CRAFT_LINES.map((line) => line.id);

export const DEFAULT_CRAFT_LINE: CraftLineId = 'attack';

export function isCraftLineId(value: string): value is CraftLineId {
  return value === 'attack' || value === 'defense';
}

/** Falls back to the default line so a stale selection can never break a view. */
export function resolveCraftLine(value: string | undefined | null): CraftLine {
  return CRAFT_LINES.find((line) => line.id === value) ?? getCraftLine(DEFAULT_CRAFT_LINE);
}

export function getCraftLine(id: CraftLineId): CraftLine {
  const line = CRAFT_LINES.find((candidate) => candidate.id === id);
  if (!line) throw new Error(`Linha de criação desconhecida: ${id}`);
  return line;
}

/** Units of each material a recipe of the given line consumes. */
export function craftLineMaterialCost(id: CraftLineId): number {
  return getCraftLine(id).materialCost;
}
