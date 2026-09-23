const { keyboard, Button } = require('@nut-tree-fork/nut-js');
const { mapCodeToKey } = require('./keymap');
const nativeMouse = require('./native-mouse');

keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

const ENTRY_INSET = 10;
const LEAVE_OVERSHOOT = 40;
const LEAVE_GRACE_MS = 250;

let cachedPos = null;
let entryEdge = 'left';
let onLeaveEdge = null;
let leaveArmedAt = 0;
let overshoot = 0;
let leaving = false;
let moveScale = 1.0;
// En Mac: Ctrl (Windows) se inyecta como Cmd.
const ctrlAsMeta = process.platform === 'darwin';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setLeaveEdgeHandler(fn) {
  onLeaveEdge = fn;
}

function setMoveScale(value) {
  const n = Number(value);
  moveScale = Number.isFinite(n) && n > 0 ? n : 1.0;
}

function entryPoint(bounds, edge, ratioY, ratioX) {
  // Sin márgenes artificiales: hay que poder llegar al Dock / barra de menú.
  const y = clamp(
    Math.round(bounds.minY + (typeof ratioY === 'number' ? ratioY : 0.5) * bounds.height),
    bounds.minY,
    bounds.maxY - 1,
  );
  const x = clamp(
    Math.round(bounds.minX + (typeof ratioX === 'number' ? ratioX : 0.5) * bounds.width),
    bounds.minX,
    bounds.maxX - 1,
  );

  switch (edge) {
    case 'right':
      return { x: bounds.maxX - 1 - ENTRY_INSET, y };
    case 'top':
      return { x, y: bounds.minY + ENTRY_INSET };
    case 'bottom':
      return { x, y: bounds.maxY - 1 - ENTRY_INSET };
    case 'left':
    default:
      return { x: bounds.minX + ENTRY_INSET, y };
  }
}

function resetCursor(msg = {}) {
  const bounds = nativeMouse.virtualBounds();
  entryEdge = msg.entryEdge || 'left';
  leaveArmedAt = Date.now() + LEAVE_GRACE_MS;
  overshoot = 0;
  leaving = false;
  cachedPos = entryPoint(bounds, entryEdge, msg.exitYRatio, msg.exitXRatio);
  nativeMouse.setPosition(cachedPos.x, cachedPos.y);
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
  // Solo cuenta como “salir” si se pasa claramente del borde (evita bloquear esquinas/Dock).
  const pad = 2;
  switch (entryEdge) {
    case 'left':
      return x < bounds.minX - pad;
    case 'right':
      return x > bounds.maxX - 1 + pad;
    case 'top':
      return y < bounds.minY - pad;
    case 'bottom':
      return y > bounds.maxY - 1 + pad;
    default:
      return false;
  }
}

function handleMousemove(msg) {
  if (leaving) return;
  if (!cachedPos) resetCursor();
  const bounds = nativeMouse.virtualBounds();
  const dx = (msg.dx || 0) * moveScale;
  const dy = (msg.dy || 0) * moveScale;
  let nextX = cachedPos.x + dx;
  let nextY = cachedPos.y + dy;

  const graceDone = Date.now() >= leaveArmedAt;
  if (graceDone && pastLeaveLine(nextX, nextY, bounds)) {
    overshoot += pushTowardLeave(dx, dy);
    if (overshoot >= LEAVE_OVERSHOOT) {
      leaving = true;
      const returnY = clamp(nextY, bounds.minY, bounds.maxY - 1);
      const returnX = clamp(nextX, bounds.minX, bounds.maxX - 1);
      cachedPos = entryPoint(
        bounds,
        entryEdge,
        (returnY - bounds.minY) / Math.max(1, bounds.height),
        (returnX - bounds.minX) / Math.max(1, bounds.width),
      );
      nativeMouse.setPosition(cachedPos.x, cachedPos.y);
      overshoot = 0;
      if (onLeaveEdge) {
        onLeaveEdge({
          t: 'edge-return',
          returnYRatio: (returnY - bounds.minY) / Math.max(1, bounds.height),
          returnXRatio: (returnX - bounds.minX) / Math.max(1, bounds.width),
        });
      }
      return;
    }
  } else if (pushTowardLeave(dx, dy) === 0) {
    overshoot = 0;
  }

  // Siempre se puede recorrer toda la pantalla (incluido Dock abajo / menú arriba).
  nextX = clamp(nextX, bounds.minX, bounds.maxX - 1);
  nextY = clamp(nextY, bounds.minY, bounds.maxY - 1);
  cachedPos = { x: nextX, y: nextY };
  nativeMouse.setPosition(cachedPos.x, cachedPos.y);
}

function handleRemoteMessage(msg) {
  switch (msg.t) {
    case 'control-start':
      resetCursor(msg);
      return;

    case 'mousemove':
      handleMousemove(msg);
      return;

    case 'mousedown': {
      const button = BUTTON_MAP[msg.button];
      if (button !== undefined) {
        const { mouse } = require('@nut-tree-fork/nut-js');
        mouse.config.autoDelayMs = 0;
        mouse.pressButton(button).catch(() => {});
      }
      return;
    }

    case 'mouseup': {
      const button = BUTTON_MAP[msg.button];
      if (button !== undefined) {
        const { mouse } = require('@nut-tree-fork/nut-js');
        mouse.config.autoDelayMs = 0;
        mouse.releaseButton(button).catch(() => {});
      }
      return;
    }

    case 'wheel': {
      const { mouse } = require('@nut-tree-fork/nut-js');
      mouse.config.autoDelayMs = 0;
      const steps = Math.max(1, Math.round(Math.abs(msg.dy) / 40));
      if (msg.dy > 0) mouse.scrollDown(steps).catch(() => {});
      else if (msg.dy < 0) mouse.scrollUp(steps).catch(() => {});
      return;
    }

    case 'keydown': {
      const key = mapCodeToKey(msg.code, { ctrlAsMeta });
      if (key !== null) keyboard.pressKey(key).catch(() => {});
      return;
    }

    case 'keyup': {
      const key = mapCodeToKey(msg.code, { ctrlAsMeta });
      if (key !== null) keyboard.releaseKey(key).catch(() => {});
      return;
    }

    default:
      break;
  }
}

function invalidateBoundsCache() {}

module.exports = {
  handleRemoteMessage,
  setLeaveEdgeHandler,
  invalidateBoundsCache,
  setMoveScale,
};
