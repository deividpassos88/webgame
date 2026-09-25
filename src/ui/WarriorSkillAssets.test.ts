import { describe, expect, it } from 'vitest';
import { renderSkillStars, warriorSkillAsset, classSkillAsset } from './WarriorSkillAssets';
import { mageSkillAsset } from './MageSkillAssets';

describe('WarriorSkillAssets', () => {
  it('maps the supplied art in the approved combat order', () => {
    expect(warriorSkillAsset('ataque_basico')).toBe('/assets/ui/skills/guerreiro/basic-attack.png');
    expect(warriorSkillAsset('ataque_giratorio')).toBe('/assets/ui/skills/guerreiro/spin.png');
    expect(warriorSkillAsset('ataque_giratorio_2')).toBe('/assets/ui/skills/guerreiro/frost-spin.png');
    expect(warriorSkillAsset('pulo_atacando')).toBe('/assets/ui/skills/guerreiro/jump-impact.png');
    expect(warriorSkillAsset('triplo_ataque')).toBe('/assets/ui/skills/guerreiro/flame-strike.png');
    expect(warriorSkillAsset('corte_duplo')).toBe('/assets/ui/skills/guerreiro/double-cut.png');
  });

  it('maps the Maga numbered webp set in the same combat order', () => {
    expect(mageSkillAsset('ataque_basico')).toBe('/assets/ui/skills/maga/1.webp');
    expect(mageSkillAsset('ataque_giratorio')).toBe('/assets/ui/skills/maga/2.webp');
    expect(mageSkillAsset('ataque_giratorio_2')).toBe('/assets/ui/skills/maga/3.webp');
    expect(mageSkillAsset('pulo_atacando')).toBe('/assets/ui/skills/maga/4.webp');
    expect(mageSkillAsset('triplo_ataque')).toBe('/assets/ui/skills/maga/5.webp');
    expect(mageSkillAsset('corte_duplo')).toBe('/assets/ui/skills/maga/6.webp');
  });

  it('picks the class folder: Guerreiro keeps png and Maga uses webp', () => {
    expect(classSkillAsset('ataque_basico', 'paladin')).toBe('/assets/ui/skills/guerreiro/basic-attack.png');
    expect(classSkillAsset('ataque_basico', 'mage')).toBe('/assets/ui/skills/maga/1.webp');
    expect(classSkillAsset('corte_duplo', 'mage')).toBe('/assets/ui/skills/maga/6.webp');
  });

  it('renders exactly five accessible star icons and fills only the earned level', () => {
    const markup = renderSkillStars(3);

    expect(markup.match(/<svg/g)).toHaveLength(5);
    expect(markup.match(/is-filled/g)).toHaveLength(3);
    expect(markup).toContain('3 de 5 estrelas');
  });
});
