import { describe, expect, it } from 'vitest';
import { renderSkillStars, warriorSkillAsset } from './WarriorSkillAssets';

describe('WarriorSkillAssets', () => {
  it('maps the supplied art in the approved combat order', () => {
    expect(warriorSkillAsset('ataque_basico')).toBe('/assets/ui/skills/basic-attack.png');
    expect(warriorSkillAsset('ataque_giratorio')).toBe('/assets/ui/skills/spin.png');
    expect(warriorSkillAsset('ataque_giratorio_2')).toBe('/assets/ui/skills/frost-spin.png');
    expect(warriorSkillAsset('pulo_atacando')).toBe('/assets/ui/skills/jump-impact.png');
    expect(warriorSkillAsset('triplo_ataque')).toBe('/assets/ui/skills/flame-strike.png');
    expect(warriorSkillAsset('corte_duplo')).toBe('/assets/ui/skills/double-cut.png');
  });

  it('renders exactly five accessible star icons and fills only the earned level', () => {
    const markup = renderSkillStars(3);

    expect(markup.match(/<svg/g)).toHaveLength(5);
    expect(markup.match(/is-filled/g)).toHaveLength(3);
    expect(markup).toContain('3 de 5 estrelas');
  });
});
