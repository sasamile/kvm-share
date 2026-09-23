const { mouse, keyboard, Button, Point } = require('@nut-tree-fork/nut-js');
const { screen: electronScreen } = require('electron');
const { mapCodeToKey } = require('./keymap');

mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 10000;
keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

const ENTRY_INSET = 8;
const Y_MARGIN = 24;
const LEAVE_OVERSHOOT = 14;
const LEAVE_GRACE_MS = 120;
const BASE_MOVE_SCALE = 1.0;

let cachedPos = null;
let entryEdge = 'left';
let onLeaveEdge = null;
let leaveArmedAt = 0;
let overshoot = 0;
let scaleX = BASE_MOVE_SCALE;
let scaleY = BASE_MOVE_SCALE;
let pendingPos = null;
let writing = false;
let cachedBounds = null;
let leaving = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function computeVirtualBounds() {
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

function virtualBounds() {
  if (!cachedBounds) cachedBounds = computeVirtualBounds();
  return cachedBounds;
}

function invalidateBoundsCache() {
  cachedBounds = null;
}

function setLeaveEdgeHandler(fn) {
  onLeaveEdge = fn;
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
      return new Point(bounds.maxX - 1 - ENTRY_INSET, y);
    case 'top':
      return new Point(x, bounds.minY + ENTRY_INSET);
    case 'bottom':
      return new Point(x, bounds.maxY - 1 - ENTRY_INSET);
    case 'left':
    default:
      return new Point(bounds.minX + ENTRY_INSET, y);
  }
}

function flushPosition() {
  if (writing || !pendingPos) return;
  writing = true;
  const point = pendingPos;
  pendingPos = null;
  // No await en cadena: aplica y sigue; si hay más, un tick después.
  Promise.resolve(mouse.setPosition(point))
    .catch(() => {})
    .finally(() => {
      writing = false;
      if (pendingPos) setImmediate(flushPosition);
    });
}

function queuePosition(point) {
  cachedPos = point;
  pendingPos = point;
  flushPosition();
}

function resetCursor(msg = {}) {
  invalidateBoundsCache();
  const bounds = virtualBounds();
  entryEdge = msg.entryEdge || 'left';
  leaveArmedAt = Date.now() + LEAVE_GRACE_MS;
  overshoot = 0;
  leaving = false;

  const peerH = Number(msg.localHeight) || 0;
  const peerW = Number(msg.localWidth) || 0;
  scaleY = peerH > 0 ? (bounds.height / peerH) * BASE_MOVE_SCALE : BASE_MOVE_SCALE;
  scaleX = peerW > 0 ? (bounds.width / peerW) * BASE_MOVE_SCALE : BASE_MOVE_SCALE;

  cachedPos = entryPoint(bounds, entryEdge, msg.exitYRatio, msg.exitXRatio);
  pendingPos = null;
  writing = false;
  mouse.setPosition(cachedPos).catch(() => {});
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
  const bounds = virtualBounds();
  const dx = (msg.dx || 0) * scaleX;
  const dy = (msg.dy || 0) * scaleY;
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
      pendingPos = null;
      mouse.setPosition(cachedPos).catch(() => {});
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
    queuePosition(new Point(
      clamp(nextX, bounds.minX, bounds.maxX - 1),
      clamp(nextY, bounds.minY, bounds.maxY - 1),
    ));
    return;
  }

  if (pushTowardLeave(dx, dy) === 0) overshoot = 0;

  queuePosition(new Point(
    clamp(nextX, bounds.minX, bounds.maxX - 1),
    clamp(nextY, bounds.minY, bounds.maxY - 1),
  ));
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
      if (button !== undefined) mouse.pressButton(button).catch(() => {});
      return;
    }

    case 'mouseup': {
      const button = BUTTON_MAP[msg.button];
      if (button !== undefined) mouse.releaseButton(button).catch(() => {});
      return;
    }

    case 'wheel': {
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

module.exports = { handleRemoteMessage, setLeaveEdgeHandler, invalidateBoundsCache };
