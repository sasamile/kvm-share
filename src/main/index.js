const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

const { loadConfig } = require('./config');
const { Peer } = require('./network');
const { createTray } = require('./tray');
const { startClipboardSync } = require('./clipboard');
const { handleRemoteMessage, setLeaveEdgeHandler, invalidateBoundsCache, setMoveScale } = require('./inject');
const { startEdgeControl, virtualBounds } = require('./edge');
const nativeMouse = require('./native-mouse');

if (app.dock) app.dock.hide();

// Menos throttling del renderer = overlay más fluido con pointer lock.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let overlayWindow = null;
let moveAcc = { dx: 0, dy: 0 };
let moveFlushTimer = null;

function createOverlayWindow() {
  const b = virtualBounds();
  const win = new BrowserWindow({
    x: b.minX,
    y: b.minY,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'overlay', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(false);
  win.loadFile(path.join(__dirname, '..', 'overlay', 'index.html'));
  return win;
}

function showOverlay() {
  const b = virtualBounds();
  overlayWindow.setBounds({ x: b.minX, y: b.minY, width: b.width, height: b.height });
  overlayWindow.show();
  overlayWindow.focus();
  overlayWindow.webContents.send('overlay-active', true);

  // Centrar en coords nativas (físicas en Windows) — un solo salto, sin timer.
  const nb = nativeMouse.virtualBounds();
  nativeMouse.setPosition(
    Math.round((nb.minX + nb.maxX) / 2),
    Math.round((nb.minY + nb.maxY) / 2),
  );
}

function hideOverlay() {
  moveAcc.dx = 0;
  moveAcc.dy = 0;
  if (moveFlushTimer) {
    clearTimeout(moveFlushTimer);
    moveFlushTimer = null;
  }
  if (!overlayWindow) return;
  overlayWindow.webContents.send('overlay-active', false);
  overlayWindow.hide();
}

function flushMoves(peer, edge) {
  moveFlushTimer = null;
  if (!edge.isSending()) {
    moveAcc.dx = 0;
    moveAcc.dy = 0;
    return;
  }
  const dx = moveAcc.dx;
  const dy = moveAcc.dy;
  moveAcc.dx = 0;
  moveAcc.dy = 0;
  if (dx === 0 && dy === 0) return;
  peer.send({ t: 'mousemove', dx, dy });
}

app.whenReady().then(() => {
  const config = loadConfig();
  setMoveScale(config.moveScale ?? 1.25);
  overlayWindow = createOverlayWindow();

  const peer = new Peer(config);
  const clipboardSync = startClipboardSync(peer);
  const tray = createTray({ config, onQuit: () => app.quit() });

  const edge = startEdgeControl({
    config,
    peer,
    onStatus: (text) => tray.setControlStatus(text),
    onEnterRemote: () => {
      clipboardSync.setPaused(true);
      showOverlay();
    },
    onLeaveRemote: () => {
      hideOverlay();
      clipboardSync.setPaused(false);
    },
  });

  setLeaveEdgeHandler((msg) => {
    peer.send(msg);
    edge.setReceiving(false);
    clipboardSync.setPaused(false);
  });

  peer.on('status', (text) => tray.setNetworkStatus(text));

  peer.on('message', (msg) => {
    if (msg.t === 'clipboard') {
      clipboardSync.applyRemote(msg.text);
      return;
    }

    // Camino rápido: mousemove sin promesas.
    if (msg.t === 'mousemove') {
      if (edge.isReceiving()) handleRemoteMessage(msg);
      return;
    }

    edge.handlePeerMessage(msg).then((handled) => {
      if (handled) return;

      if (msg.t === 'control-start') {
        edge.setReceiving(true);
        clipboardSync.setPaused(true);
        handleRemoteMessage(msg);
        return;
      }

      if (msg.t === 'control-end') {
        edge.setReceiving(false);
        clipboardSync.setPaused(false);
        return;
      }

      if (!edge.isReceiving()) return;
      handleRemoteMessage(msg);
    });
  });

  ipcMain.on('overlay-input', (_event, data) => {
    if (!edge.isSending()) return;
    if (data.t === 'mousemove') {
      moveAcc.dx += data.dx || 0;
      moveAcc.dy += data.dy || 0;
      if (!moveFlushTimer) {
        // ~200 Hz de envío coalescido (SetCursorPos aguanta; nut-js no).
        moveFlushTimer = setTimeout(() => flushMoves(peer, edge), 5);
      }
      return;
    }
    // Clic/tecla: vaciar movimiento pendiente primero.
    flushMoves(peer, edge);
    peer.send(data);
  });

  ipcMain.on('overlay-lock-lost', () => {
    edge.forceReturn();
  });

  const hotkey = config.controlHotkey || 'Control+Alt+K';
  const toggleControl = () => {
    if (edge.isSending()) {
      edge.forceReturn();
      return;
    }
    edge.forceStart().then((ok) => {
      if (!ok) {
        console.warn(`[kvm] ${hotkey}: necesita estar Conectado al otro PC primero.`);
      }
    });
  };

  const registered = globalShortcut.register(hotkey, toggleControl);
  if (!registered) {
    console.error(`No se pudo registrar el atajo "${hotkey}". Prueba otro en config.json (ej. "Control+Shift+K").`);
  } else {
    console.log(`[kvm] atajo listo: ${hotkey} = ir/volver al otro PC`);
  }

  screen.on('display-metrics-changed', () => {
    invalidateBoundsCache();
    if (overlayWindow && overlayWindow.isVisible()) {
      const b = virtualBounds();
      overlayWindow.setBounds({ x: b.minX, y: b.minY, width: b.width, height: b.height });
    }
  });

  console.log(`[kvm] paso por borde → peer en "${config.peerEdge || 'right'}"`);
  console.log(`[kvm] si ves "Desconectado": en la Mac debe estar listen + bun run start`);
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
