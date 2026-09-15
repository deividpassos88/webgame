export type ExperienceEncounterRole = 'regular' | 'mini-boss' | 'boss';

export interface CharacterProgression {
  readonly level: number;
  readonly experience: number;
}

export interface ExperienceAward {
  readonly progression: CharacterProgression;
  readonly experienceGranted: number;
  readonly levelsGained: number;
  readonly pointsGranted: number;
}

export interface ExperienceProgress {
  readonly current: number;
  readonly required: number;
  readonly percent: number;
}

/** Kept as a legacy display unit while new UI reads `experienceProgressFor`. */
export const XP_PER_LEVEL = 100;
export const ATTRIBUTE_POINTS_PER_LEVEL = 5;
export const CHAPTER_MAX_LEVEL = 21;
export const CHAPTER_MAX_EXPERIENCE = experienceAtLevelStart(CHAPTER_MAX_LEVEL);

const SIX_WAVE_XP = [
  { regular: 2, miniBoss: 5 },
  { regular: 3, miniBoss: 6 },
  { regular: 4, miniBoss: 7 },
  { regular: 5, miniBoss: 8 },
  { regular: 6, miniBoss: 9 },
  { regular: 7, miniBoss: 10 },
] as const;
const FINAL_BOSS_XP = 155;

export function createInitialProgression(): CharacterProgression {
  return { level: 1, experience: 0 };
}

/** The required XP grows from 60 (level 1) to 440 (level 20). */
export function experienceRequiredForLevel(level: number): number {
  const currentLevel = clampInteger(level, 1, CHAPTER_MAX_LEVEL);
  return currentLevel >= CHAPTER_MAX_LEVEL ? 0 : 40 + currentLevel * 20;
}

/** Total chapter XP required at the start of a given level. */
export function experienceAtLevelStart(level: number): number {
  const normalizedLevel = clampInteger(level, 1, CHAPTER_MAX_LEVEL);
  const completedLevelUps = normalizedLevel - 1;
  return 10 * completedLevelUps * (completedLevelUps + 5);
}

export function experienceProgressFor(progression: CharacterProgression): ExperienceProgress {
  const current = normalizeProgression(progression);
  if (current.level >= CHAPTER_MAX_LEVEL) {
    return { current: 0, required: 0, percent: 100 };
  }
  const required = experienceRequiredForLevel(current.level);
  const currentExperience = current.experience - experienceAtLevelStart(current.level);
  return {
    current: currentExperience,
    required,
    percent: Math.min(100, Math.max(0, (currentExperience / required) * 100)),
  };
}

export function normalizeProgression(value: unknown): CharacterProgression {
  const source = isRecord(value) ? value : {};
  const rawExperience = typeof source.experience === 'number' && Number.isFinite(source.experience)
    ? source.experience
    : 0;
  const experience = clampInteger(rawExperience, 0, CHAPTER_MAX_EXPERIENCE);
  return {
    level: levelForExperience(experience),
    experience,
  };
}

/** Six escalating regular waves prepare the player for one high-value final boss. */
export function experienceForEncounter(role: ExperienceEncounterRole, wave = 1): number {
  if (role === 'boss') return FINAL_BOSS_XP;
  const normalizedWave = Number.isFinite(wave)
    ? Math.min(SIX_WAVE_XP.length, Math.max(1, Math.floor(wave)))
    : 1;
  const rewards = SIX_WAVE_XP[normalizedWave - 1];
  return role === 'regular' ? rewards.regular : rewards.miniBoss;
}

export function awardExperience(
  progression: CharacterProgression,
  role: ExperienceEncounterRole,
  wave = 1
): ExperienceAward {
  const current = normalizeProgression(progression);
  const experienceGranted = Math.max(
    0,
    Math.min(experienceForEncounter(role, wave), CHAPTER_MAX_EXPERIENCE - current.experience)
  );
  const next = normalizeProgression({ experience: current.experience + experienceGranted });
  const levelsGained = Math.max(0, next.level - current.level);
  return {
    progression: next,
    experienceGranted,
    levelsGained,
    pointsGranted: levelsGained * ATTRIBUTE_POINTS_PER_LEVEL,
  };
}

function levelForExperience(experience: number): number {
  let level = 1;
  while (
    level < CHAPTER_MAX_LEVEL
    && experience >= experienceAtLevelStart(level + 1)
  ) {
    level += 1;
  }
  return level;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
