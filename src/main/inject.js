const { mouse, keyboard, screen, Button, Point } = require('@nut-tree-fork/nut-js');
const { mapCodeToKey } = require('./keymap');

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

let screenBounds = null;
let cachedPos = null;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function ensureScreenBounds() {
  if (!screenBounds) {
    screenBounds = { width: await screen.width(), height: await screen.height() };
  }
  return screenBounds;
}

// Se llama al iniciar cada sesión de control remoto para partir de la
// posición real del cursor local (evita saltos por desincronización).
async function resetCursor() {
  cachedPos = await mouse.getPosition();
  await ensureScreenBounds();
}

async function handleRemoteMessage(msg) {
  switch (msg.t) {
    case 'control-start':
      await resetCursor();
      break;

    case 'mousemove': {
      if (!cachedPos) await resetCursor();
      const bounds = await ensureScreenBounds();
      const x = clamp(cachedPos.x + msg.dx, 0, bounds.width - 1);
      const y = clamp(cachedPos.y + msg.dy, 0, bounds.height - 1);
      cachedPos = new Point(x, y);
      await mouse.setPosition(cachedPos);
      break;
    }

    case 'mousedown': {
      const button = BUTTON_MAP[msg.button];
      if (button !== undefined) await mouse.pressButton(button);
      break;
    }

    case 'mouseup': {
      const button = BUTTON_MAP[msg.button];
      if (button !== undefined) await mouse.releaseButton(button);
      break;
    }

    case 'wheel': {
      const steps = Math.max(1, Math.round(Math.abs(msg.dy) / 50));
      if (msg.dy > 0) await mouse.scrollDown(steps);
      else if (msg.dy < 0) await mouse.scrollUp(steps);
      if (msg.dx) {
        const hSteps = Math.max(1, Math.round(Math.abs(msg.dx) / 50));
        if (msg.dx > 0) await mouse.scrollRight(hSteps);
        else await mouse.scrollLeft(hSteps);
      }
      break;
    }

    case 'keydown': {
      const key = mapCodeToKey(msg.code);
      if (key !== null) await keyboard.pressKey(key);
      break;
    }

    case 'keyup': {
      const key = mapCodeToKey(msg.code);
      if (key !== null) await keyboard.releaseKey(key);
      break;
    }

    default:
      break;
  }
}

module.exports = { handleRemoteMessage };
