// Keyboard and mouse input. Held keys give a steering direction; one-shot
// presses (interact, punch, jump, pause, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and
// never counted twice. Mouse movement feeds a look delta the camera consumes.

export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_JUMP = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;
export const ACTION_RELOAD = 64;
export const ACTION_SHOOT = 128;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['Escape', 'KeyP']);

export function createInput(target) {
  const held = { forward: false, back: false, left: false, right: false, run: false };
  let actions = 0;
  let lookX = 0;
  let lookY = 0;
  let mouseDown = false;
  let pointerLocked = false;

  function press(code) {
    if (code === 'KeyE') actions |= ACTION_INTERACT;
    else if (code === 'KeyF') actions |= ACTION_PUNCH;
    else if (code === 'Space') actions |= ACTION_JUMP;
    else if (code === 'KeyM') actions |= ACTION_MUTE;
    else if (code === 'KeyR') actions |= ACTION_RELOAD;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', (event) => {
    if (FORWARD.has(event.code)) held.forward = true;
    else if (BACK.has(event.code)) held.back = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (RUN.has(event.code)) held.run = true;
    else if (event.code === 'Space' || event.code === 'Enter') {
      if (!event.repeat) press(event.code);
    } else if (!event.repeat) press(event.code);
    else return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (FORWARD.has(event.code)) held.forward = false;
    else if (BACK.has(event.code)) held.back = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.forward = held.back = held.left = held.right = held.run = false;
    mouseDown = false;
  });

  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_SHOOT;
      if (!pointerLocked && target.requestPointerLock) {
        try { target.requestPointerLock(); } catch { /* pointer lock is optional */ }
      }
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (pointerLocked || mouseDown) {
      lookX += event.movementX || 0;
      lookY += event.movementY || 0;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === target;
  });

  // Headless QA (`?test=1`) can push synthetic input without a real device.
  let override = null;
  let overrideActions = 0;

  return {
    /** Replace the device axes for the next read (null restores the keyboard). */
    setOverride(next) { override = next; },
    /** Queue ACTION_* flags as if they had been pressed. */
    pushActions(mask) { overrideActions |= mask; },
    /** Steering axes: strafe -1..1, throttle -1..1. */
    axes() {
      if (override) return override;
      return {
        strafe: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        throttle: (held.forward ? 1 : 0) - (held.back ? 1 : 0),
        run: held.run,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions | overrideActions;
      actions = 0;
      overrideActions = 0;
      return taken;
    },
    /** Accumulated mouse look since the last call; resets on read. */
    takeLook() {
      const look = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return look;
    },
    get mouseDown() { return mouseDown; },
  };
}
