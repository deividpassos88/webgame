// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { HitCounter } from '../combat/HitCounter';
import { HitCounterView } from './HitCounterView';

describe('HitCounterView', () => {
  it('shows the running hit count and hides when the streak ends', () => {
    const view = new HitCounterView(document.createElement('div'));
    const counter = new HitCounter();

    view.render(counter.snapshot());
    expect(view.element.classList.contains('is-visible')).toBe(false);

    for (let hit = 0; hit < 12; hit += 1) counter.registerHit();
    view.render(counter.snapshot());
    expect(view.element.classList.contains('is-visible')).toBe(true);
    expect(view.element.querySelector('[data-hit-number]')!.textContent).toBe('12');
    expect(view.element.dataset.tier).toBe('1');

    counter.update(5);
    view.render(counter.snapshot());
    expect(view.element.classList.contains('is-visible')).toBe(false);
  });
});
