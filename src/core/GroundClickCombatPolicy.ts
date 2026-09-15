export type GroundClickCombatAction = 'attack-cursor' | 'attack-training-dummy';

const TRAINING_DUMMY_ATTACK_RADIUS = 2.2;

/** Ground clicks never navigate: near the dummy targets it, all others attack at the cursor. */
export function resolveGroundClickCombatAction(
  trainingDummyDistance: number | null
): GroundClickCombatAction {
  return trainingDummyDistance !== null && trainingDummyDistance < TRAINING_DUMMY_ATTACK_RADIUS
    ? 'attack-training-dummy'
    : 'attack-cursor';
}
