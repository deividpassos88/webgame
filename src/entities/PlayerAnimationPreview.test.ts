import { describe, expect, it } from 'vitest';
import { PlayerAnimationPreview } from './PlayerAnimationPreview';

describe('PlayerAnimationPreview', () => {
  it('keeps a looping preview active until another state is selected', () => {
    const preview = new PlayerAnimationPreview();

    preview.select('running');

    expect(preview.finish('running')).toBeNull();
    expect(preview.activeState).toBe('running');
  });

  it('returns a completed one-shot preview to idle', () => {
    const preview = new PlayerAnimationPreview();

    preview.select('attacking');

    expect(preview.finish('attacking')).toBe('idle');
    expect(preview.activeState).toBe('idle');
  });

  it('ignores completion events from an action that is not being previewed', () => {
    const preview = new PlayerAnimationPreview();

    preview.select('dead');

    expect(preview.finish('hit')).toBeNull();
    expect(preview.activeState).toBe('dead');
  });

  it('clears the preview when gameplay input resumes', () => {
    const preview = new PlayerAnimationPreview();
    preview.select('running');

    preview.clear();

    expect(preview.activeState).toBeNull();
  });
});
