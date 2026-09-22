const { mouse, keyboard, Button, Point } = require('@nut-tree-fork/nut-js');
const { screen: electronScreen } = require('electron');
const { mapCodeToKey } = require('./keymap');

mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 10000;
keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

// Entrar bien dentro de la pantalla (no en la esquina).
const ENTRY_INSET = 160;
// Margen superior/inferior para no pegarse a las esquinas.
const Y_MARGIN = 40;
// Hay que “empujar” past el borde esta cantidad antes de volver.
const LEAVE_OVERSHOOT = 60;
// No permitir volver en los primeros ms (evita rebote en la esquina).
const LEAVE_GRACE_MS = 900;
// Amplifica un poco el movimiento para que se sienta más natural.
const MOVE_SCALE = 1.35;

let cachedPos = null;
let entryEdge = 'left';
let onLeaveEdge = null;
let leaveArmedAt = 0;
let overshoot = 0;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function virtualBounds() {
  const displays = electronScreen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function setLeaveEdgeHandler(fn) {
  onLeaveEdge = fn;
}

function entryPoint(bounds, edge, ratioY) {
  const y = clamp(
    Math.round(bounds.minY + (typeof ratioY === 'number' ? ratioY : 0.5) * bounds.height),
    bounds.minY + Y_MARGIN,
    bounds.maxY - 1 - Y_MARGIN,
  );
  const midX = Math.round(bounds.minX + bounds.width / 2);

  switch (edge) {
    case 'right':
      return new Point(bounds.maxX - 1 - ENTRY_INSET, y);
    case 'top':
      return new Point(midX, bounds.minY + ENTRY_INSET);
    case 'bottom':
      return new Point(midX, bounds.maxY - 1 - ENTRY_INSET);
    case 'left':
    default:
      return new Point(bounds.minX + ENTRY_INSET, y);
  }
}

async function resetCursor(msg = {}) {
  const bounds = virtualBounds();
  entryEdge = msg.entryEdge || 'left';
  leaveArmedAt = Date.now() + LEAVE_GRACE_MS;
  overshoot = 0;
  cachedPos = entryPoint(bounds, entryEdge, msg.exitYRatio);
  await mouse.setPosition(cachedPos);
}

function pushTowardLeave(dx, dy) {
  switch (entryEdge) {
    case 'left':
      return dx < 0 ? -dx : 0;
    case 'right':
      return dx > 0 ? dx : 0;
    case 'top':
      return dy < 0 ? -dy : 0;
    case 'bottom':
      return dy > 0 ? dy : 0;
    default:
      return 0;
  }
}

function pastLeaveLine(x, y, bounds) {
  switch (entryEdge) {
    case 'left':
      return x <= bounds.minX;
    case 'right':
      return x >= bounds.maxX - 1;
    case 'top':
      return y <= bounds.minY;
    case 'bottom':
      return y >= bounds.maxY - 1;
    default:
      return false;
  }
}

async function handleRemoteMessage(msg) {
  switch (msg.t) {
    case 'control-start':
      await resetCursor(msg);
      break;

    case 'mousemove': {
      if (!cachedPos) await resetCursor();
      const bounds = virtualBounds();
      const dx = (msg.dx || 0) * MOVE_SCALE;
      const dy = (msg.dy || 0) * MOVE_SCALE;
      const nextX = cachedPos.x + dx;
      const nextY = cachedPos.y + dy;

      const graceDone = Date.now() >= leaveArmedAt;
      if (graceDone && pastLeaveLine(nextX, nextY, bounds)) {
        overshoot += pushTowardLeave(dx, dy);
        if (overshoot >= LEAVE_OVERSHOOT) {
          const returnX = clamp(nextX, bounds.minX, bounds.maxX - 1);
          const returnY = clamp(nextY, bounds.minY, bounds.maxY - 1);
          cachedPos = entryPoint(bounds, entryEdge, (returnY - bounds.minY) / Math.max(1, bounds.height));
          await mouse.setPosition(cachedPos);
          overshoot = 0;
          if (onLeaveEdge) {
            onLeaveEdge({ t: 'edge-return', returnX, returnY });
          }
          break;
        }
        // Pegado al borde pero aún no supera el umbral: mantener en el borde interior.
        cachedPos = new Point(
          clamp(nextX, bounds.minX, bounds.maxX - 1),
          clamp(nextY, bounds.minY, bounds.maxY - 1),
        );
        await mouse.setPosition(cachedPos);
        break;
      }

      // Si se aleja del borde de salida, reinicia el contador.
      if (pushTowardLeave(dx, dy) === 0) overshoot = 0;

      const x = clamp(nextX, bounds.minX, bounds.maxX - 1);
      const y = clamp(nextY, bounds.minY, bounds.maxY - 1);
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

module.exports = { handleRemoteMessage, setLeaveEdgeHandler };
