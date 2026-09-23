const nativeMouse = require('./native-mouse');

const POLL_MS = 12;
const EDGE_PX = 4;
const PARK_MARGIN = 10;
const COOLDOWN_MS = 180;

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

function startEdgeControl({ config, peer, onStatus, onEnterRemote, onLeaveRemote }) {
  const peerEdge = config.peerEdge || 'right';
  let sending = false;
  let receiving = false;
  let timer = null;
  let exitY = 0;
  let exitX = 0;
  let cooldownUntil = 0;

  function setStatus(text) {
    if (onStatus) onStatus(text);
  }

  function beginSending(pos) {
    if (sending || receiving || !peer.connected) return;
    sending = true;
    exitX = pos.x;
    exitY = pos.y;
    const vb = nativeMouse.virtualBounds();
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

  function endSending(placeLocal = true) {
    if (!sending) return;
    sending = false;
    setStatus('local');
    peer.send({ t: 'control-end' });
    if (onLeaveRemote) onLeaveRemote();
    if (placeLocal) {
      const b = nativeMouse.virtualBounds();
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
        nativeMouse.setPosition(x, y);
      } catch (_) {
        /* ignore */
      }
    }
    console.log('[edge] control local');
    cooldownUntil = Date.now() + COOLDOWN_MS;
  }

  function tick() {
    if (receiving || sending) return;
    if (Date.now() < cooldownUntil) return;
    try {
      const pos = nativeMouse.getPosition();
      if (!pos) return;
      const bounds = nativeMouse.virtualBounds();
      if (peer.connected && hitExitEdge(pos, bounds, peerEdge)) {
        beginSending(pos);
      }
    } catch (err) {
      console.error('[edge] tick error:', err.message);
    }
  }

  timer = setInterval(tick, POLL_MS);

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
      if (!sending) {
        if (onLeaveRemote) onLeaveRemote();
        setStatus('local');
        return;
      }
      endSending(true);
    },

    async forceStart() {
      if (sending || receiving) return false;
      if (!peer.connected) {
        console.warn('[edge] No hay peer conectado; no se puede controlar.');
        setStatus('sin peer (no conectado)');
        return false;
      }
      try {
        const pos = nativeMouse.getPosition() || { x: 0, y: 0 };
        beginSending(pos);
        return true;
      } catch (err) {
        console.error('[edge] forceStart:', err.message);
        return false;
      }
    },

    async handlePeerMessage(msg) {
      if (msg.t === 'edge-return') {
        const b = nativeMouse.virtualBounds();
        if (typeof msg.returnYRatio === 'number') {
          exitY = b.minY + msg.returnYRatio * b.height;
        } else if (typeof msg.returnY === 'number') {
          exitY = msg.returnY;
        }
        if (typeof msg.returnXRatio === 'number') {
          exitX = b.minX + msg.returnXRatio * b.width;
        } else if (typeof msg.returnX === 'number') {
          exitX = msg.returnX;
        }
        endSending(true);
        return true;
      }
      if (msg.t === 'control-end' && sending) {
        endSending(true);
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

module.exports = {
  startEdgeControl,
  virtualBounds: () => nativeMouse.electronOverlayBounds(),
  oppositeEdge,
};
