// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from './Logger';

function mountLoggerUi() {
  document.body.innerHTML = `
    <button id="debug-log-fab"></button>
    <section id="debug-log-panel"></section>
    <div id="debug-log-content"></div>
  `;
}

describe('LoggerService DOM rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    mountLoggerUi();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('defers DOM creation while the panel is closed and renders history on open', () => {
    const logger = new LoggerService();
    logger.init();
    logger.setDebugPanelEnabled(true);

    logger.debug('Input', 'primeiro');
    logger.debug('Input', 'segundo');
    expect(document.querySelectorAll('.log-line')).toHaveLength(0);

    logger.openPanel();
    expect(document.querySelectorAll('.log-line')).toHaveLength(3);
  });

  it('bounds visible DOM entries to the same 500-entry history limit', () => {
    const logger = new LoggerService();
    logger.init();
    logger.setDebugPanelEnabled(true);
    logger.openPanel();

    for (let index = 0; index < 520; index++) {
      logger.debug('Frame', `registro ${index}`);
    }

    expect(logger.getHistory()).toHaveLength(500);
    expect(document.querySelectorAll('.log-line')).toHaveLength(500);
    expect(document.querySelector('.log-line')?.textContent).toContain('registro 20');
  });

  it('recalculates the badge from the bounded persisted history', () => {
    const history = Array.from({ length: 501 }, (_, index) => ({
      level: index === 500 ? 'warn' : 'debug',
      message: `entrada ${index}`,
      timestamp: index,
    }));
    localStorage.setItem('dragon_miner_logs', JSON.stringify({
      history,
      errorCount: 9_999,
      warnCount: 9_999,
    }));

    const logger = new LoggerService();
    logger.init();

    expect(logger.getHistory()).toHaveLength(500);
    expect(document.getElementById('debug-log-fab')?.getAttribute('data-count')).toBe('1');
  });

  it('does not expose or open the debug panel for a non-admin session', () => {
    const logger = new LoggerService();
    logger.init();

    logger.openPanel();

    expect(document.getElementById('debug-log-panel')?.classList.contains('open')).toBe(false);
    expect(document.getElementById('debug-log-fab')?.classList.contains('hidden')).toBe(true);
  });
});
