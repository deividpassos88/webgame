import { describe, expect, it } from 'vitest';
import { RewardFlow } from './RewardFlow';

describe('RewardFlow', () => {
  it('walks to a distant chest, opens in range, and allows one claim', () => {
    const flow = new RewardFlow(2.2);

    expect(flow.start(true)).toBe('spawn');
    expect(flow.start(true)).toBe('ignored');
    expect(flow.clickChest(5)).toBe('approach');
    expect(flow.playerDistanceChanged(1.5)).toBe('open');
    expect(flow.openingFinished()).toBe('choose');
    expect(flow.claim('sword')).toBe('claimed');
    expect(flow.claim('axe')).toBe('ignored');
    expect(flow.state).toBe('claimed');
  });

  it('opens immediately when clicked in range', () => {
    const flow = new RewardFlow(2.2);
    flow.start(true);

    expect(flow.clickChest(2.2)).toBe('open');
    expect(flow.state).toBe('opening');
  });

  it('skips directly to reward choice when the chest model is unavailable', () => {
    const flow = new RewardFlow();

    expect(flow.start(false)).toBe('choose');
    expect(flow.state).toBe('choosing');
  });

  it('resets a claimed flow to wait for a fresh chest', () => {
    const flow = new RewardFlow();
    flow.start(false);
    flow.claim('sword');

    flow.reset();

    expect(flow.state).toBe('waiting-for-chest');
    expect(flow.start(true)).toBe('spawn');
  });
});
