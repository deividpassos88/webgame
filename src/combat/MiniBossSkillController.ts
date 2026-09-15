import * as THREE from 'three';

export type MiniBossSkillKind = 'circle' | 'rectangle';
export type MiniBossSkillPhase = 'resting' | 'telegraph';

/** The mini-boss keeps the boss skill silhouettes at exactly half scale. */
export const MINI_BOSS_SKILL_GEOMETRY = Object.freeze({
  circleRadius: 8.75,
  rectangleLength: 60,
  rectangleWidth: 12,
});

export const MINI_BOSS_SKILL_DAMAGE_MULTIPLIER = 1.5;
export const MINI_BOSS_SKILL_TELEGRAPH_SECONDS = 2;

export interface MiniBossSkillEvent {
  type: 'telegraph' | 'retarget' | 'impact';
  skill: MiniBossSkillKind;
  secondsUntilImpact: number;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  /** Optional stable id lets one shared effect renderer filter one mini-boss. */
  ownerId?: string;
}

export interface MiniBossSkillFrame {
  events: MiniBossSkillEvent[];
  damage: number;
}

const SKILLS: readonly MiniBossSkillKind[] = ['circle', 'rectangle'];
const REST_DURATION = 5;

/**
 * State machine for one mini-boss. Every instance owns its timer and target
 * snapshots, so several mini-bosses can telegraph at the same time.
 */
export class MiniBossSkillController {
  public phase: MiniBossSkillPhase = 'resting';
  public restRemaining = REST_DURATION;

  private telegraphRemaining = 0;
  private currentSkill: MiniBossSkillKind | null = null;
  private previousSkill: MiniBossSkillKind | null = null;
  private origin = new THREE.Vector3();
  private target = new THREE.Vector3();

  public constructor(
    private readonly random: () => number = Math.random,
    private readonly ownerId?: string
  ) {}

  public update(
    delta: number,
    miniBossPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    miniBossAttackDamage = 0
  ): MiniBossSkillFrame {
    let remaining = Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (remaining <= 0) return this.emptyFrame();

    const events: MiniBossSkillEvent[] = [];
    let damage = 0;
    let startedTelegraph = false;

    while (remaining > 1e-9) {
      if (this.phase === 'resting') {
        if (remaining + 1e-9 < this.restRemaining) {
          this.restRemaining -= remaining;
          break;
        }
        remaining = Math.max(0, remaining - this.restRemaining);
        const telegraph = this.startTelegraph(miniBossPosition, playerPosition);
        startedTelegraph = true;
        if (remaining <= 1e-9) {
          events.push(telegraph);
          break;
        }
        continue;
      }

      if (!this.currentSkill) break;
      const skill = this.currentSkill;
      const consumed = Math.min(remaining, this.telegraphRemaining);
      this.telegraphRemaining = Math.max(0, this.telegraphRemaining - consumed);
      remaining = Math.max(0, remaining - consumed);

      if (this.telegraphRemaining > 1e-9) {
        if (startedTelegraph) events.push(this.createEvent('telegraph', skill));
        break;
      }

      damage += this.damageAtImpact(skill, playerPosition, miniBossAttackDamage);
      events.push(this.createEvent('impact', skill));
      this.previousSkill = skill;
      this.currentSkill = null;
      this.phase = 'resting';
      this.restRemaining = REST_DURATION;
      startedTelegraph = false;
    }

    return { events, damage };
  }

  public reset(): void {
    this.phase = 'resting';
    this.restRemaining = REST_DURATION;
    this.telegraphRemaining = 0;
    this.currentSkill = null;
    this.previousSkill = null;
  }

  private startTelegraph(
    miniBossPosition: THREE.Vector3,
    playerPosition: THREE.Vector3
  ): MiniBossSkillEvent {
    const choices = SKILLS.filter((skill) => skill !== this.previousSkill);
    const random = THREE.MathUtils.clamp(this.random(), 0, 0.999999);
    this.currentSkill = choices[Math.floor(random * choices.length)];
    this.phase = 'telegraph';
    this.telegraphRemaining = MINI_BOSS_SKILL_TELEGRAPH_SECONDS;
    this.origin.copy(miniBossPosition);
    this.target.copy(playerPosition);
    return this.createEvent('telegraph', this.currentSkill);
  }

  private createEvent(
    type: MiniBossSkillEvent['type'],
    skill: MiniBossSkillKind
  ): MiniBossSkillEvent {
    return {
      type,
      skill,
      secondsUntilImpact: type === 'impact' ? 0 : this.telegraphRemaining,
      origin: this.origin.clone(),
      target: this.target.clone(),
      ...(this.ownerId === undefined ? {} : { ownerId: this.ownerId }),
    };
  }

  private damageAtImpact(
    skill: MiniBossSkillKind,
    player: THREE.Vector3,
    miniBossAttackDamage: number
  ): number {
    const damage = Math.max(0, miniBossAttackDamage) * MINI_BOSS_SKILL_DAMAGE_MULTIPLIER;
    if (skill === 'circle') {
      return this.horizontalDistanceSquared(player, this.target)
        <= MINI_BOSS_SKILL_GEOMETRY.circleRadius ** 2
        ? damage
        : 0;
    }

    return this.isInsideOrientedRectangle(
      player,
      MINI_BOSS_SKILL_GEOMETRY.rectangleLength,
      MINI_BOSS_SKILL_GEOMETRY.rectangleWidth
    ) ? damage : 0;
  }

  private isInsideOrientedRectangle(
    point: THREE.Vector3,
    length: number,
    width: number
  ): boolean {
    const directionX = this.target.x - this.origin.x;
    const directionZ = this.target.z - this.origin.z;
    const directionLength = Math.hypot(directionX, directionZ) || 1;
    const forwardX = directionX / directionLength;
    const forwardZ = directionZ / directionLength;
    const offsetX = point.x - this.origin.x;
    const offsetZ = point.z - this.origin.z;
    const forward = offsetX * forwardX + offsetZ * forwardZ;
    const lateral = Math.abs(offsetX * -forwardZ + offsetZ * forwardX);
    return forward >= 0 && forward <= length && lateral <= width * 0.5;
  }

  private horizontalDistanceSquared(a: THREE.Vector3, b: THREE.Vector3): number {
    const x = a.x - b.x;
    const z = a.z - b.z;
    return x * x + z * z;
  }

  private emptyFrame(): MiniBossSkillFrame {
    return { events: [], damage: 0 };
  }
}
