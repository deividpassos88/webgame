// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import {
  InputManager,
  isEditableInputTarget,
  readMovementInput,
} from './InputManager';

const managers: InputManager[] = [];

function createInputManager() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const manager = new InputManager(canvas);
  managers.push(manager);
  return { canvas, manager };
}

function keyboardEvent(
  type: 'keydown' | 'keyup',
  init: KeyboardEventInit
) {
  return new KeyboardEvent(type, { bubbles: true, ...init });
}

afterEach(() => {
  managers.splice(0).forEach((manager) => manager.dispose());
  document.body.innerHTML = '';
});

describe('isEditableInputTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('blocks shortcuts from %s controls', (tagName) => {
    expect(isEditableInputTarget({ tagName, isContentEditable: false })).toBe(true);
  });

  it('allows shortcuts from the canvas and blocks contenteditable elements', () => {
    expect(isEditableInputTarget({ tagName: 'CANVAS', isContentEditable: false })).toBe(false);
    expect(isEditableInputTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
});

describe('InputManager keyboard ownership', () => {
  it('tracks movement by physical code across layout-dependent key values', () => {
    const { canvas, manager } = createInputManager();

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyW', key: 'z' }));
    expect(manager.keys.w).toBe(true);

    canvas.dispatchEvent(keyboardEvent('keyup', { code: 'KeyW', key: 'z' }));
    expect(manager.keys.w).toBe(false);
  });

  it('maps either physical Shift key to the dash command', () => {
    const { canvas, manager } = createInputManager();

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));

    expect(manager.wasKeyPressed('shift')).toBe(true);
    expect(manager.keys.shift).toBe(true);
  });

  it('captures a release even when a focused UI control stops bubbling it', () => {
    const { canvas, manager } = createInputManager();
    const button = document.createElement('button');
    button.addEventListener('keyup', (event) => event.stopPropagation());
    document.body.appendChild(button);

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyS', key: 's' }));
    button.dispatchEvent(keyboardEvent('keyup', { code: 'KeyS', key: 's' }));

    expect(manager.keys.s).toBe(false);
  });

  it('resets held movement when focus enters an editable control', () => {
    const { canvas, manager } = createInputManager();
    const input = document.createElement('input');
    document.body.appendChild(input);

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyS', key: 's' }));
    input.focus();

    expect(manager.keys.s).toBeUndefined();
    expect(manager.consumeMovementReset()).toBe(true);
    expect(manager.consumeMovementReset()).toBe(false);
  });

  it('requests movement cancellation after window blur', () => {
    const { canvas, manager } = createInputManager();
    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyW', key: 'w' }));

    window.dispatchEvent(new Event('blur'));

    expect(manager.keys.w).toBeUndefined();
    expect(manager.consumeMovementReset()).toBe(true);
  });

  it('keeps a blur cancellation pending when a non-movement shortcut follows', () => {
    const { canvas, manager } = createInputManager();
    window.dispatchEvent(new Event('blur'));

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyH', key: 'h' }));

    expect(manager.consumeMovementReset()).toBe(true);
  });

  it('keeps a blur cancellation pending until the game consumes a newer click', () => {
    const { canvas, manager } = createInputManager();
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    window.dispatchEvent(new Event('blur'));

    canvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: 50,
      clientY: 50,
    }));

    expect(manager.consumeMovementReset()).toBe(true);
    expect(manager.leftClicked).toBe(true);
  });

  it('releases held input and ignores game keys while a panel owns keyboard focus', () => {
    const { canvas, manager } = createInputManager();
    const setGameplayInputBlocked = (
      manager as InputManager & { setGameplayInputBlocked?: (blocked: boolean) => void }
    ).setGameplayInputBlocked;

    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    setGameplayInputBlocked?.(true);
    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'Digit1', key: '1' }));

    expect(manager.keys.w).toBeUndefined();
    expect(manager.wasKeyPressed('1')).toBe(false);

    setGameplayInputBlocked?.(false);
    canvas.dispatchEvent(keyboardEvent('keydown', { code: 'Digit1', key: '1' }));
    expect(manager.wasKeyPressed('1')).toBe(true);
  });
});

describe('readMovementInput', () => {
  it('accepts only WASD keys as player movement', () => {
    expect(readMovementInput({ arrowup: true, arrowleft: true })).toEqual({
      horizontal: 0,
      vertical: 0,
      hasIntent: false,
    });
  });

  it('distinguishes opposing-key intent from a zero net axis', () => {
    expect(readMovementInput({ w: true, s: true })).toEqual({
      horizontal: 0,
      vertical: 0,
      hasIntent: true,
    });
  });

  it('reports no intent when no movement key is held', () => {
    expect(readMovementInput({})).toEqual({
      horizontal: 0,
      vertical: 0,
      hasIntent: false,
    });
  });
});
