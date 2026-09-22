const { mouse, keyboard, Button, Point } = require('@nut-tree-fork/nut-js');
const { screen: electronScreen } = require('electron');
const { mapCodeToKey } = require('./keymap');

mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 10000;
keyboard.config.autoDelayMs = 0;

const BUTTON_MAP = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

let cachedPos = null;
let entryEdge = 'left';
let onLeaveEdge = null;

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

async function resetCursor(msg = {}) {
  const bounds = virtualBounds();
  entryEdge = msg.entryEdge || 'left';

  const ratioY = typeof msg.exitYRatio === 'number' ? msg.exitYRatio : 0.5;
  const y = clamp(
    Math.round(bounds.minY + ratioY * bounds.height),
    bounds.minY,
    bounds.maxY - 1,
  );

  let x;
  switch (entryEdge) {
    case 'right':
      x = bounds.maxX - 2;
      break;
    case 'top':
      x = clamp(Math.round(bounds.minX + bounds.width / 2), bounds.minX, bounds.maxX - 1);
      cachedPos = new Point(x, bounds.minY + 2);
      await mouse.setPosition(cachedPos);
      return;
    case 'bottom':
      x = clamp(Math.round(bounds.minX + bounds.width / 2), bounds.minX, bounds.maxX - 1);
      cachedPos = new Point(x, bounds.maxY - 2);
      await mouse.setPosition(cachedPos);
      return;
    case 'left':
    default:
      x = bounds.minX + 2;
      break;
  }

  cachedPos = new Point(x, y);
  await mouse.setPosition(cachedPos);
}

function wouldLeave(x, y, bounds) {
  // Salir por el borde opuesto al de entrada.
  switch (entryEdge) {
    case 'left':
      return x < bounds.minX;
    case 'right':
      return x > bounds.maxX - 1;
    case 'top':
      return y < bounds.minY;
    case 'bottom':
      return y > bounds.maxY - 1;
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
      const nextX = cachedPos.x + msg.dx;
      const nextY = cachedPos.y + msg.dy;

      if (wouldLeave(nextX, nextY, bounds)) {
        const returnX = clamp(nextX, bounds.minX, bounds.maxX - 1);
        const returnY = clamp(nextY, bounds.minY, bounds.maxY - 1);
        cachedPos = new Point(
          entryEdge === 'left' ? bounds.minX + 2 : entryEdge === 'right' ? bounds.maxX - 2 : returnX,
          entryEdge === 'top' ? bounds.minY + 2 : entryEdge === 'bottom' ? bounds.maxY - 2 : returnY,
        );
        await mouse.setPosition(cachedPos);
        if (onLeaveEdge) {
          onLeaveEdge({
            t: 'edge-return',
            returnY: returnY,
            returnX: returnX,
          });
        }
        break;
      }

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
