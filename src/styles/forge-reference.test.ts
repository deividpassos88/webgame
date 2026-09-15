import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./forge-reference.css', import.meta.url), 'utf8');

describe('forge responsive layout contract', () => {
  it('keeps the desktop layout at intrinsic height instead of stretching it into a fixed screen row', () => {
    expect(styles).toMatch(
      /#blacksmith-screen\s+\.workshop-layout\s*\{[^}]*align-self:\s*start;/s,
    );
  });

  it('neutralizes legacy grid sizing on the conversation and equipment panels', () => {
    expect(styles).toMatch(
      /#blacksmith-screen\s+\.workshop-conversation,\s*#blacksmith-screen\s+\.workshop-equipment\s*\{[^}]*display:\s*block;/s,
    );
  });

  it('lets the forge scene define its own height without a legacy flex minimum', () => {
    expect(styles).toMatch(
      /#blacksmith-screen\s+\.workshop-conversation\s+\.blacksmith-scene\s*\{[^}]*flex:\s*none;[^}]*min-height:\s*0;/s,
    );
  });

  it('keeps the primary weapon slot compact instead of inheriting a square ratio', () => {
    expect(styles).toMatch(
      /#blacksmith-screen\s+\.equipment-grid\s+\.equipment-slot\s*\{[^}]*aspect-ratio:\s*auto;/s,
    );
  });

  it('does not duplicate the visible equipment label with aria-label text', () => {
    expect(styles).toMatch(
      /#blacksmith-screen\s+\.equipment-grid\s+\.equipment-slot::after\s*\{[^}]*display:\s*none;/s,
    );
  });
});
