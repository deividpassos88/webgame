import * as THREE from 'three';

export function isEditableInputTarget(
  target: { readonly tagName?: string; readonly isContentEditable?: boolean } | null
): boolean {
  if (!target) return false;
  return target.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(
    target.tagName?.toUpperCase() ?? ''
  );
}

const PHYSICAL_KEY_NAMES: Readonly<Record<string, string>> = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyH: 'h',
  KeyI: 'i',
  KeyK: 'k',
  KeyQ: 'q',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  Escape: 'escape',
  Space: 'space',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
};

export function gameKeyForEvent(event: KeyboardEvent): string {
  return PHYSICAL_KEY_NAMES[event.code] ?? event.key.toLowerCase();
}

export interface MovementInput {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
  hasIntent: boolean;
}

export interface InputSnapshot {
  activeKeys: string[];
  movement: MovementInput;
  clickPending: boolean;
  resetPending: boolean;
}

export function readMovementInput(keys: Readonly<Record<string, boolean>>): MovementInput {
  const forward = Boolean(keys.w);
  const backward = Boolean(keys.s);
  const left = Boolean(keys.a);
  const right = Boolean(keys.d);
  return {
    horizontal: ((right ? 1 : 0) - (left ? 1 : 0)) as -1 | 0 | 1,
    vertical: ((backward ? 1 : 0) - (forward ? 1 : 0)) as -1 | 0 | 1,
    hasIntent: forward || backward || left || right,
  };
}

/**
 * Gerencia entradas de mouse e teclado.
 * O raycasting em si é feito no Game.ts (que tem acesso à cena/câmera).
 */
export class InputManager {
  public mouse = new THREE.Vector2(0, 0);
  public clickedMouse = new THREE.Vector2(0, 0);
  public leftClicked = false;
  public keys: Record<string, boolean> = {};
  private keyPressedOnce: Set<string> = new Set();
  private movementResetPending = false;
  private gameplayInputBlocked = false;

  constructor(private readonly domElement: HTMLElement) {
    /*
     * Pointer events cover mouse, touch and pen with one path, which is what
     * tablets use; the mouse handlers stay as a fallback for engines that
     * still synthesise only mouse events.
     */
    domElement.addEventListener('pointerdown', this.handlePointerDown);
    domElement.addEventListener('mousedown', this.handleMouseDown);
    domElement.addEventListener('pointermove', this.handleMouseMove);
    domElement.addEventListener('mousemove', this.handleMouseMove);
    domElement.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('blur', this.reset);
    window.addEventListener('pagehide', this.reset);
    document.addEventListener('focusin', this.handleFocusIn, true);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') event.preventDefault();
    this.handleMouseDown(event);
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (this.gameplayInputBlocked) return;
    if (event.button !== 0) return;
    const rect = this.domElement.getBoundingClientRect();
    this.clickedMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.clickedMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.leftClicked = true;
  };

  private handleMouseMove = (event: MouseEvent) => {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private handleContextMenu = (event: Event) => event.preventDefault();

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.gameplayInputBlocked) return;
    if (isEditableInputTarget(event.target as HTMLElement | null)) return;
    const key = gameKeyForEvent(event);
    if (['w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
    }
    if (!this.keys[key]) this.keyPressedOnce.add(key);
    this.keys[key] = true;
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys[gameKeyForEvent(event)] = false;
  };

  private handleFocusIn = (event: FocusEvent) => {
    if (isEditableInputTarget(event.target as HTMLElement | null)) this.reset();
  };

  private handleVisibilityChange = () => {
    if (document.hidden) this.reset();
  };

  public reset = () => {
    this.keys = {};
    this.leftClicked = false;
    this.keyPressedOnce.clear();
    this.movementResetPending = true;
  };

  public setGameplayInputBlocked = (blocked: boolean): void => {
    if (this.gameplayInputBlocked === blocked) return;
    this.gameplayInputBlocked = blocked;
    this.reset();
  };

  public consumeMovementReset(): boolean {
    const pending = this.movementResetPending;
    this.movementResetPending = false;
    return pending;
  }

  public getSnapshot(): InputSnapshot {
    const movement = readMovementInput(this.keys);
    return {
      activeKeys: Object.keys(this.keys).filter((key) => this.keys[key]).sort(),
      movement,
      clickPending: this.leftClicked,
      resetPending: this.movementResetPending,
    };
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.domElement.removeEventListener('pointermove', this.handleMouseMove);
    this.domElement.removeEventListener('mousemove', this.handleMouseMove);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('blur', this.reset);
    window.removeEventListener('pagehide', this.reset);
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** Deve ser chamado ao final de cada frame do game loop */
  public postUpdate() {
    this.leftClicked = false;
    this.keyPressedOnce.clear();
  }

  public wasKeyPressed(key: string): boolean {
    return this.keyPressedOnce.has(key.toLowerCase());
  }
}
