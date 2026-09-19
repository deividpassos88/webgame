import * as THREE from 'three';

export type BossSkillKind = 'circle' | 'rectangle' | 'meteors';
export type BossSkillPhase = 'resting' | 'telegraph';

export const BOSS_SKILL_GEOMETRY = Object.freeze({
  circleRadius: 17.5,
  rectangleLength: 120,
  rectangleWidth: 24,
  meteorRadius: 1.35,
  meteorCount: 30,
  meteorSpreadRadius: 18,
});

export interface BossSkillEvent {
  type: 'telegraph' | 'impact';
  skill: BossSkillKind;
  secondsUntilImpact: number;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  meteorPoints: THREE.Vector3[];
}

export interface BossSkillFrame {
  events: BossSkillEvent[];
  damage: number;
}

const SKILLS: readonly BossSkillKind[] = [
  'circle',
  'rectangle',
  'meteors',
];
const REST_DURATION = 5;
const TELEGRAPH_DURATIONS: Readonly<Record<BossSkillKind, number>> = {
  circle: 4.2,
  rectangle: 3.5,
  meteors: 1,
};

export class BossSkillController {
  public phase: BossSkillPhase = 'resting';
  public restRemaining = REST_DURATION;

  private telegraphRemaining = 0;
  private currentSkill: BossSkillKind | null = null;
  private previousSkill: BossSkillKind | null = null;
  private origin = new THREE.Vector3();
  private target = new THREE.Vector3();
  private meteorPoints: THREE.Vector3[] = [];

  public constructor(private readonly random: () => number = Math.random) {}

  public update(
    delta: number,
    bossPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    damageMultiplier = 1,
    restDuration = REST_DURATION
  ): BossSkillFrame {
    const elapsed = Math.max(0, delta);
    if (this.phase === 'resting') {
      this.restRemaining = Math.max(0, this.restRemaining - elapsed);
      if (this.restRemaining > 0) return this.emptyFrame();
      return { events: [this.startTelegraph(bossPosition, playerPosition)], damage: 0 };
    }

    this.telegraphRemaining = Math.max(0, this.telegraphRemaining - elapsed);
    if (this.telegraphRemaining > 1e-9 || !this.currentSkill) return this.emptyFrame();

    const skill = this.currentSkill;
    const damage = this.damageAtImpact(skill, playerPosition, damageMultiplier);
    const event = this.createEvent('impact', skill);
    this.previousSkill = skill;
    this.currentSkill = null;
    this.phase = 'resting';
    this.restRemaining = restDuration;
    return { events: [event], damage };
  }

  public reset(): void {
    this.phase = 'resting';
    this.restRemaining = REST_DURATION;
    this.telegraphRemaining = 0;
    this.currentSkill = null;
    this.previousSkill = null;
    this.meteorPoints = [];
  }

  private startTelegraph(
    bossPosition: THREE.Vector3,
    playerPosition: THREE.Vector3
  ): BossSkillEvent {
    const choices = SKILLS.filter((skill) => skill !== this.previousSkill);
    const random = THREE.MathUtils.clamp(this.random(), 0, 0.999999);
    this.currentSkill = choices[Math.floor(random * choices.length)];
    this.phase = 'telegraph';
    this.telegraphRemaining = TELEGRAPH_DURATIONS[this.currentSkill];
    this.origin.copy(bossPosition);
    this.target.copy(playerPosition);
    this.meteorPoints = this.createMeteorPoints(this.target);
    return this.createEvent('telegraph', this.currentSkill);
  }

  private createMeteorPoints(center: THREE.Vector3): THREE.Vector3[] {
    const points = [center.clone()];
    const surroundingCount = BOSS_SKILL_GEOMETRY.meteorCount - 1;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < surroundingCount; index++) {
      const normalizedRadius = Math.sqrt((index + 1) / surroundingCount);
      const radius = BOSS_SKILL_GEOMETRY.meteorSpreadRadius * normalizedRadius;
      const angle = index * goldenAngle;
      points.push(
        new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          center.y,
          center.z + Math.sin(angle) * radius
        )
      );
    }
    return points;
  }

  private createEvent(
    type: BossSkillEvent['type'],
    skill: BossSkillKind
  ): BossSkillEvent {
    return {
      type,
      skill,
      secondsUntilImpact: type === 'telegraph' ? TELEGRAPH_DURATIONS[skill] : 0,
      origin: this.origin.clone(),
      target: this.target.clone(),
      meteorPoints: this.meteorPoints.map((point) => point.clone()),
    };
  }

  private damageAtImpact(
    skill: BossSkillKind,
    player: THREE.Vector3,
    damageMultiplier = 1
  ): number {
    let baseDamage = 0;
    if (skill === 'circle') {
      baseDamage = this.horizontalDistanceSquared(player, this.target)
        <= BOSS_SKILL_GEOMETRY.circleRadius ** 2 ? 23 : 0;
    } else if (skill === 'meteors') {
      baseDamage = this.meteorPoints.some(
        (point) => this.horizontalDistanceSquared(player, point)
          <= BOSS_SKILL_GEOMETRY.meteorRadius ** 2
      ) ? 9 : 0;
    } else {
      const hit = this.isInsideOrientedRectangle(
        player,
        BOSS_SKILL_GEOMETRY.rectangleLength,
        BOSS_SKILL_GEOMETRY.rectangleWidth
      );
      baseDamage = hit ? 24 : 0;
    }
    return Math.round(baseDamage * Math.max(0, damageMultiplier));
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

  private emptyFrame(): BossSkillFrame {
    return { events: [], damage: 0 };
  }
}
