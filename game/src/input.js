// input.js — keyboard + mouse controls for the Kestrel.
// Keys are read as a live set; the flight loop polls them each frame.
// Mouse steering: holding the left button banks the jet toward the cursor.
export function createInput() {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, active: false };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
  }
  function onMouseDown(e) { if (e.button === 0) mouse.down = true; }
  function onMouseUp(e) { if (e.button === 0) mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', () => keys.clear());

  function pressed(code) { return keys.has(code); }

  // Returns the per-frame control vector for stepFlight.
  function poll() {
    const pitch = (pressed('KeyW') || pressed('ArrowUp') ? 1 : 0)
      - (pressed('KeyS') || pressed('ArrowDown') ? 1 : 0);
    const roll = (pressed('KeyD') || pressed('ArrowRight') ? 1 : 0)
      - (pressed('KeyA') || pressed('ArrowLeft') ? 1 : 0);
    const yaw = (pressed('KeyE') ? 1 : 0) - (pressed('KeyQ') ? 1 : 0);
    const throttleDelta = (pressed('ShiftLeft') || pressed('ShiftRight') ? 1 : 0)
      - (pressed('ControlLeft') || pressed('ControlRight') ? 1 : 0);
    const mouseSteer = mouse.down && mouse.active ? clamp(mouse.x, -1, 1) : 0;
    const mousePitch = mouse.down && mouse.active ? clamp(-mouse.y, -1, 1) * 0.5 : 0;
    return {
      pitch: clamp(pitch + mousePitch, -1, 1),
      roll,
      yaw,
      throttleDelta,
      mouseSteer,
    };
  }

  // Edge-triggered actions, consumed once per keypress by main.js.
  const edgeQueue = [];
  function onKeyPress(e) {
    if (e.repeat) return;
    edgeQueue.push(e.code);
  }
  window.addEventListener('keydown', onKeyPress);

  function consume(code) {
    const i = edgeQueue.indexOf(code);
    if (i >= 0) { edgeQueue.splice(i, 1); return true; }
    return false;
  }

  return { keys, mouse, poll, consume, pressed };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
