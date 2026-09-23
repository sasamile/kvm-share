const { keyboard, Button } = require('@nut-tree-fork/nut-js');
const { mapCodeToKey } = require('./keymap');
const nativeMouse = require('./native-mouse');

keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

const ENTRY_INSET = 12;
const Y_MARGIN = 20;
const LEAVE_OVERSHOOT = 18;
const LEAVE_GRACE_MS = 150;

let cachedPos = null;
let entryEdge = 'left';
let onLeaveEdge = null;
let leaveArmedAt = 0;
let overshoot = 0;
let leaving = false;
let moveScale = 1.0;

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
  const y = clamp(
    Math.round(bounds.minY + (typeof ratioY === 'number' ? ratioY : 0.5) * bounds.height),
    bounds.minY + Y_MARGIN,
    bounds.maxY - 1 - Y_MARGIN,
  );
  const x = clamp(
    Math.round(bounds.minX + (typeof ratioX === 'number' ? ratioX : 0.5) * bounds.width),
    bounds.minX + Y_MARGIN,
    bounds.maxX - 1 - Y_MARGIN,
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
  // movementX/Y ya es relativo: NO escalar por ancho de escritorio (eso hacía
  // el cursor lentísimo / “no pasa de media pantalla” con varios monitores).
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

function handleMousemove(msg) {
  if (leaving) return;
  if (!cachedPos) resetCursor();
  const bounds = nativeMouse.virtualBounds();
  const dx = (msg.dx || 0) * moveScale;
  const dy = (msg.dy || 0) * moveScale;
  const nextX = cachedPos.x + dx;
  const nextY = cachedPos.y + dy;

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
    cachedPos = {
      x: clamp(nextX, bounds.minX, bounds.maxX - 1),
      y: clamp(nextY, bounds.minY, bounds.maxY - 1),
    };
    nativeMouse.setPosition(cachedPos.x, cachedPos.y);
    return;
  }

  if (pushTowardLeave(dx, dy) === 0) overshoot = 0;

  cachedPos = {
    x: clamp(nextX, bounds.minX, bounds.maxX - 1),
    y: clamp(nextY, bounds.minY, bounds.maxY - 1),
  };
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
      const key = mapCodeToKey(msg.code);
      if (key !== null) keyboard.pressKey(key).catch(() => {});
      return;
    }

    case 'keyup': {
      const key = mapCodeToKey(msg.code);
      if (key !== null) keyboard.releaseKey(key).catch(() => {});
      return;
    }

    default:
      break;
  }
}

function invalidateBoundsCache() {
  // native GetSystemMetrics no cachea; no-op para compat.
}

module.exports = {
  handleRemoteMessage,
  setLeaveEdgeHandler,
  invalidateBoundsCache,
  setMoveScale,
};
