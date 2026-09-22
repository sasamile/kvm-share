const { mouse, Point } = require('@nut-tree-fork/nut-js');
const { screen: electronScreen } = require('electron');

mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 10000;

const POLL_MS = 10;
const EDGE_PX = 3;
const PARK_MARGIN = 80;

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
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function oppositeEdge(edge) {
  return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[edge] || 'left';
}

function hitExitEdge(pos, bounds, edge) {
  switch (edge) {
    case 'right':
      return pos.x >= bounds.maxX - EDGE_PX;
    case 'left':
      return pos.x <= bounds.minX + EDGE_PX;
    case 'bottom':
      return pos.y >= bounds.maxY - EDGE_PX;
    case 'top':
      return pos.y <= bounds.minY + EDGE_PX;
    default:
      return false;
  }
}

/**
 * Detecta salida por el borde. Al cruzar, avisa para capturar input
 * (overlay sin Pointer Lock). No esconde el cursor del sistema.
 */
function startEdgeControl({ config, peer, onStatus, onEnterRemote, onLeaveRemote }) {
  const peerEdge = config.peerEdge || 'right';
  let sending = false;
  let receiving = false;
  let timer = null;
  let exitY = 0;
  let exitX = 0;
  let busy = false;
  let cooldownUntil = 0;

  function setStatus(text) {
    if (onStatus) onStatus(text);
  }

  async function beginSending(pos) {
    if (sending || receiving || !peer.connected) return;
    sending = true;
    exitX = pos.x;
    exitY = pos.y;
    const vb = virtualBounds();
    setStatus('remoto (enviando)');
    peer.send({
      t: 'control-start',
      entryEdge: oppositeEdge(peerEdge),
      exitYRatio: vb.height > 0 ? (pos.y - vb.minY) / vb.height : 0.5,
      exitXRatio: vb.width > 0 ? (pos.x - vb.minX) / vb.width : 0.5,
      localHeight: vb.height,
      localWidth: vb.width,
    });
    if (onEnterRemote) onEnterRemote();
    console.log(`[edge] saliendo por ${peerEdge} → control remoto`);
  }

  async function endSending(placeLocal = true) {
    if (!sending) return;
    sending = false;
    setStatus('local');
    peer.send({ t: 'control-end' });
    if (onLeaveRemote) onLeaveRemote();
    if (placeLocal) {
      const b = virtualBounds();
      let x = exitX;
      let y = exitY;
      switch (peerEdge) {
        case 'right':
          x = b.maxX - PARK_MARGIN;
          break;
        case 'left':
          x = b.minX + PARK_MARGIN;
          break;
        case 'bottom':
          y = b.maxY - PARK_MARGIN;
          break;
        case 'top':
          y = b.minY + PARK_MARGIN;
          break;
        default:
          break;
      }
      try {
        await mouse.setPosition(new Point(x, y));
      } catch (_) {
        /* ignore */
      }
    }
    console.log('[edge] control local');
    cooldownUntil = Date.now() + 600;
  }

  async function tick() {
    if (busy || receiving || sending) return;
    busy = true;
    try {
      const pos = await mouse.getPosition();
      const bounds = virtualBounds();
      if (Date.now() < cooldownUntil) return;
      if (peer.connected && hitExitEdge(pos, bounds, peerEdge)) {
        await beginSending(pos);
      }
    } catch (err) {
      console.error('[edge] tick error:', err.message);
    } finally {
      busy = false;
    }
  }

  timer = setInterval(() => {
    tick();
  }, POLL_MS);

  return {
    isSending: () => sending,
    isReceiving: () => receiving,

    setReceiving(value) {
      receiving = value;
      if (value) {
        if (sending) {
          sending = false;
          peer.send({ t: 'control-end' });
          if (onLeaveRemote) onLeaveRemote();
        }
        setStatus('remoto (recibiendo)');
      } else {
        setStatus('local');
      }
    },

    async forceReturn() {
      await endSending(true);
    },

    async handlePeerMessage(msg) {
      if (msg.t === 'edge-return') {
        exitX = typeof msg.returnX === 'number' ? msg.returnX : exitX;
        exitY = typeof msg.returnY === 'number' ? msg.returnY : exitY;
        await endSending(true);
        return true;
      }
      if (msg.t === 'control-end' && sending) {
        await endSending(true);
        return true;
      }
      return false;
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { startEdgeControl, virtualBounds, oppositeEdge };
