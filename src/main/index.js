const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

const { loadConfig } = require('./config');
const { Peer } = require('./network');
const { createTray } = require('./tray');
const { startClipboardSync } = require('./clipboard');
const { handleRemoteMessage, setLeaveEdgeHandler } = require('./inject');
const { startEdgeControl, virtualBounds } = require('./edge');

if (app.dock) app.dock.hide();

let overlayWindow = null;
let recenterTimer = null;

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
    webPreferences: {
      preload: path.join(__dirname, '..', 'overlay', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
  // Sacar el cursor del borde: si se queda en la esquina, Windows no genera más movimiento.
  const { mouse, Point } = require('@nut-tree-fork/nut-js');
  const cx = Math.round(b.minX + b.width / 2);
  const cy = Math.round(b.minY + b.height / 2);
  mouse.setPosition(new Point(cx, cy)).catch(() => {});

  // Recentrar solo si se pega al borde (Windows deja de emitir movementX/Y).
  if (recenterTimer) clearInterval(recenterTimer);
  recenterTimer = setInterval(() => {
    mouse.getPosition().then((pos) => {
      const edge = 24;
      if (
        pos.x <= b.minX + edge ||
        pos.x >= b.maxX - edge ||
        pos.y <= b.minY + edge ||
        pos.y >= b.maxY - edge
      ) {
        return mouse.setPosition(new Point(cx, cy));
      }
      return null;
    }).catch(() => {});
  }, 120);
}

function hideOverlay() {
  if (recenterTimer) {
    clearInterval(recenterTimer);
    recenterTimer = null;
  }
  if (!overlayWindow) return;
  overlayWindow.webContents.send('overlay-active', false);
  overlayWindow.hide();
}

app.whenReady().then(() => {
  const config = loadConfig();
  overlayWindow = createOverlayWindow();

  const peer = new Peer(config);
  const clipboardSync = startClipboardSync(peer);
  const tray = createTray({ config, onQuit: () => app.quit() });

  const edge = startEdgeControl({
    config,
    peer,
    onStatus: (text) => tray.setControlStatus(text),
    onEnterRemote: () => showOverlay(),
    onLeaveRemote: () => hideOverlay(),
  });

  setLeaveEdgeHandler((msg) => {
    peer.send(msg);
    edge.setReceiving(false);
  });

  peer.on('status', (text) => tray.setNetworkStatus(text));

  peer.on('message', (msg) => {
    if (msg.t === 'clipboard') {
      clipboardSync.applyRemote(msg.text);
      return;
    }

    edge.handlePeerMessage(msg).then((handled) => {
      if (handled) return;

      if (msg.t === 'control-start') {
        edge.setReceiving(true);
        return handleRemoteMessage(msg).catch((err) => {
          console.error('Error inyectando input remoto:', err);
        });
      }

      if (msg.t === 'control-end') {
        edge.setReceiving(false);
        return;
      }

      if (!edge.isReceiving()) return;

      return handleRemoteMessage(msg).catch((err) => {
        console.error('Error inyectando input remoto:', err);
      });
    });
  });

  ipcMain.on('overlay-input', (_event, data) => {
    if (!edge.isSending()) return;
    peer.send(data);
  });

  ipcMain.on('overlay-lock-lost', () => {
    edge.forceReturn();
  });

  const hotkey = config.controlHotkey || 'Control+Alt+K';
  const registered = globalShortcut.register(hotkey, () => {
    if (edge.isSending()) edge.forceReturn();
  });
  if (!registered) {
    console.error(`No se pudo registrar el atajo "${hotkey}".`);
  }

  screen.on('display-metrics-changed', () => {
    if (overlayWindow && overlayWindow.isVisible()) {
      const b = virtualBounds();
      overlayWindow.setBounds({ x: b.minX, y: b.minY, width: b.width, height: b.height });
    }
  });

  console.log(`[kvm] paso por borde → peer en "${config.peerEdge || 'right'}"`);
  console.log(`[kvm] emergencia (devolver mouse): ${hotkey}`);
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
