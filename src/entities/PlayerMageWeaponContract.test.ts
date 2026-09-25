import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const player = readFileSync(new URL('./Player.ts', import.meta.url), 'utf8');
const lobbyPresentation = readFileSync(
  new URL('../ui/LobbyPresentation.ts', import.meta.url),
  'utf8'
);
const game = readFileSync(new URL('../core/Game.ts', import.meta.url), 'utf8');

/**
 * Contrato da arma da Maga: ela luta com o cajado embutido no próprio modelo.
 * Nenhum fluxo pode anexar a espada do Guerreiro nela, e o cajado nunca pode
 * ser escondido (nem no lobby, nem na seleção de personagem, nem no jogo).
 */
describe('Maga weapon contract', () => {
  it('never attaches the equipped weapon visual on the mage', () => {
    expect(player).toContain("const hideWeaponVisual = this.characterId === 'mage';");
    expect(player).toContain(
      'const equipped = mountedEmbeddedSword || hideWeaponVisual'
    );
    // equipVirtual não anexa geometria; equip anexa.
    expect(player).toContain(
      '? this.weaponEquipment.equipVirtual(definition.id)'
    );
  });

  it('keeps the embedded staff visible and hides stray swords on load', () => {
    expect(player).toContain("model.getObjectByName('cajado')");
    expect(player).toContain("model.getObjectByName('espada')");
    expect(player).toMatch(
      /characterId === 'mage' && this\.embeddedStaff[\s\S]{0,60}visible = true/
    );
  });

  it('never hides staff/cajado nodes in the lobby previews', () => {
    expect(lobbyPresentation).not.toMatch(/WEAPON_NODE = .*cajado/);
    expect(lobbyPresentation).not.toMatch(/WEAPON_NODE = .*staff/);
  });

  it('skips loading the sword model entirely for mage runs', () => {
    expect(game).toContain(
      "this.profile.selectedClass !== 'mage' && this.rewardAssets.hasWeapon('sword')"
    );
  });
});
