import * as THREE from 'three';
import { MAGE_MAX_RANGE_METERS } from './DistanceDamage';
import type { WarriorSkillId } from './WarriorSkillCatalog';
import type { MageSpellId } from '../vfx/VFXTypes';

/** Hand-to-chest slack so a bolt still finishes on a body at the 7m cone. */
export const MAGE_SPELL_REACH_SLACK = 0.8;
export const MAGE_SPELL_TRAVEL_METERS = MAGE_MAX_RANGE_METERS + MAGE_SPELL_REACH_SLACK;

export interface MageSpellColumn<T> {
  readonly target: T;
  readonly x: number;
  readonly z: number;
  readonly minY: number;
  readonly maxY: number;
  readonly radius: number;
}

const SPELL_ATTACK_ID: Record<Exclude<MageSpellId, 'basic'>, WarriorSkillId> = {
  water: 'ataque_giratorio',
  ice: 'ataque_giratorio_2',
  lightning: 'pulo_atacando',
  lava: 'corte_duplo',
  laser: 'triplo_ataque',
};

export function mageSkillAttackId(spellId: MageSpellId): WarriorSkillId | null {
  if (spellId === 'basic') return null;
  return SPELL_ATTACK_ID[spellId];
}

/**
 * First living body a spell segment actually enters. A bolt must stop here
 * instead of continuing through the monster and exploding behind it.
 */
export function firstColumnHit<T>(
  from: THREE.Vector3,
  to: THREE.Vector3,
  columns: readonly MageSpellColumn<T>[]
): { readonly target: T; readonly t: number } | null {
  let best: { target: T; t: number } | null = null;
  for (const column of columns) {
    const t = columnEntryT(from, to, column);
    if (t === null) continue;
    if (!best || t < best.t) best = { target: column.target, t };
  }
  return best;
}

function columnEntryT(
  from: THREE.Vector3,
  to: THREE.Vector3,
  column: MageSpellColumn<unknown>
): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const fx = from.x - column.x;
  const fz = from.z - column.z;
  const radius = Math.max(0.05, column.radius);
  const a = dx * dx + dz * dz;
  const inside = fx * fx + fz * fz <= radius * radius;
  if (a <= 1e-8) {
    return inside && yOnColumn(from.y, column) ? 0 : null;
  }

  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 && !inside) return null;

  const candidates: number[] = [];
  if (inside) candidates.push(0);
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    candidates.push((-b - root) / (2 * a), (-b + root) / (2 * a));
  }

  let best: number | null = null;
  for (const t of candidates) {
    if (t < -1e-4 || t > 1 + 1e-4) continue;
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const y = from.y + (to.y - from.y) * clamped;
    if (!yOnColumn(y, column)) continue;
    if (best === null || clamped < best) best = clamped;
  }
  return best;
}

function yOnColumn(y: number, column: MageSpellColumn<unknown>): boolean {
  return y >= column.minY - 0.35 && y <= column.maxY + 0.35;
}
