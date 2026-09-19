import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { resolveEquippedBaseDamage } from './Game';

const game = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

describe('Game campaign progression contract', () => {
  it('keeps the live profile reference when granting XP from the defeated wave', () => {
    expect(game).toContain('const experienceWave = this.runProgression.snapshot.wave;');
    expect(game).toContain("this.runProgression.snapshot.phase === 'regular-wave' || death.role === 'boss'");
    expect(game).toContain('Object.assign(this.profile, awardPlayerExperience(this.profile, death.role, experienceWave));');
    expect(game).not.toContain('this.profile = awardPlayerExperience(this.profile, death.role);');
  });

  it('rejects locked skills and applies the catalog damage multiplier before distance falloff', () => {
    expect(game).toContain('if (!isWarriorSkillUnlocked(id, this.profile.progression.level)) return;');
    expect(game).toContain('getWarriorSkillDamage(this.player.attackDamage) * warriorSkillDamageMultiplier(event.attackId)');
  });

  it('derives base damage from the equipped catalog weapon instead of a fallback sword', () => {
    const profileWithSwordOnlyInBackpack = createDefaultPlayerProfile();
    const profileWithStarterSwordEquipped = createDefaultPlayerProfile();
    profileWithStarterSwordEquipped.equipment.weapon = 'starter-sword';
    profileWithStarterSwordEquipped.equipment.primaryWeapon = 'starter-sword';

    expect(resolveEquippedBaseDamage(profileWithSwordOnlyInBackpack)).toBe(0);
    expect(resolveEquippedBaseDamage(profileWithStarterSwordEquipped)).toBe(5);
  });

  it('renders the scaled fatigue reserve against current max fatigue', () => {
    expect(game).toContain('this.hud.updatePlayerFatigue(fatigue, this.fatigue.currentMaxFatigue);');
  });

  it('schedules the lobby return when the reward coordinator is unavailable', () => {
    expect(game).toContain(`} else {
            this.hud.showVictoryScreen();
            this.victoryLobbyTransition.start();
          }`);
  });

  it('rearms the victory route if the persisted reset cannot be saved', () => {
    expect(game).toContain(`catch (error) {
      Logger.error('Game:Flow', 'Falha ao retornar automaticamente ao lobby.', error);
      this.victoryLobbyTransition.start();`);
  });

});
