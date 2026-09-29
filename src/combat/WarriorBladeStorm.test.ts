import { describe, expect, it } from 'vitest';
import { WarriorBladeStorm } from './WarriorBladeStorm';
import { BLADE_STORM_ARC_COUNT, BLADE_STORM_INTERVAL_SECONDS } from './WarriorSkillEffects';

describe('Tempestade de arcos do Corte Duplo', () => {
  it('solta o primeiro arco na hora e o resto no intervalo', () => {
    const arcs: number[] = [];
    const storm = new WarriorBladeStorm((index) => arcs.push(index));

    storm.start({ arcCount: BLADE_STORM_ARC_COUNT, intervalSeconds: BLADE_STORM_INTERVAL_SECONDS });
    expect(arcs).toHaveLength(1);
    expect(storm.active).toBe(true);
    expect(storm.pendingArcs).toBe(BLADE_STORM_ARC_COUNT - 1);

    storm.update(BLADE_STORM_INTERVAL_SECONDS - 0.01);
    expect(arcs).toHaveLength(1);

    storm.update(0.02);
    expect(arcs).toHaveLength(2);
    expect(storm.pendingArcs).toBe(BLADE_STORM_ARC_COUNT - 2);
  });

  it('solta todos os arcos e desliga sozinho', () => {
    let count = 0;
    const storm = new WarriorBladeStorm(() => { count += 1; });
    storm.start({ arcCount: BLADE_STORM_ARC_COUNT, intervalSeconds: BLADE_STORM_INTERVAL_SECONDS });

    for (let i = 0; i < 20 && storm.active; i++) storm.update(0.05);

    expect(count).toBe(BLADE_STORM_ARC_COUNT);
    expect(storm.active).toBe(false);
    expect(storm.pendingArcs).toBe(0);
  });

  it('um frame longo não fura a fila inteira de uma vez', () => {
    const arcs: number[] = [];
    const storm = new WarriorBladeStorm((index) => arcs.push(index));
    storm.start({ arcCount: BLADE_STORM_ARC_COUNT, intervalSeconds: 0.1 });

    storm.update(0.3);
    // O primeiro já saiu no start; um frame de 0,3 s libera 2 (0,1 + 0,1) e
    // guarda o resto, em vez de disparar tudo de uma vez.
    expect(arcs.length).toBeLessThanOrEqual(3);
    expect(arcs.length).toBeGreaterThanOrEqual(2);
  });

  it('clear() cancela a sequência pendente', () => {
    let count = 0;
    const storm = new WarriorBladeStorm(() => { count += 1; });
    storm.start({ arcCount: 4, intervalSeconds: 0.2 });
    expect(count).toBe(1);

    storm.clear();
    storm.update(1);
    expect(count).toBe(1);
    expect(storm.active).toBe(false);
  });
});
