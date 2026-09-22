const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

const { loadConfig } = require('./config');
const { Peer } = require('./network');
const { createTray } = require('./tray');
const { startClipboardSync } = require('./clipboard');
const { handleRemoteMessage } = require('./inject');

// Evita el icono en el Dock en macOS: esto es una app de bandeja, no de ventana.
if (app.dock) app.dock.hide();

let overlayWindow = null;
let isControlling = false; // true mientras ESTA máquina está enviando su input a la otra

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'overlay', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'overlay', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  const config = loadConfig();
  overlayWindow = createOverlayWindow();

  const peer = new Peer(config);
  const clipboardSync = startClipboardSync(peer);

  const tray = createTray({ config, onQuit: () => app.quit() });

  peer.on('status', (text) => tray.setNetworkStatus(text));

  peer.on('message', (msg) => {
    if (msg.t === 'clipboard') {
      clipboardSync.applyRemote(msg.text);
      return;
    }
    if (msg.t === 'control-start') {
      tray.setControlStatus('remoto (recibiendo)');
    }
    if (msg.t === 'control-end') {
      tray.setControlStatus('local');
    }
    handleRemoteMessage(msg).catch((err) => console.error('Error inyectando input remoto:', err));
  });

  function startControlling() {
    if (isControlling) return;
    isControlling = true;
    tray.setControlStatus('remoto (enviando)');
    peer.send({ t: 'control-start' });
    overlayWindow.show();
    overlayWindow.focus();
  }

  function stopControlling() {
    if (!isControlling) return;
    isControlling = false;
    tray.setControlStatus('local');
    peer.send({ t: 'control-end' });
    overlayWindow.hide();
  }

  const registered = globalShortcut.register(config.controlHotkey, () => {
    if (isControlling) stopControlling();
    else startControlling();
  });
  if (!registered) {
    console.error(`No se pudo registrar el atajo "${config.controlHotkey}". Cambia "controlHotkey" en config.json.`);
  }

  ipcMain.on('overlay-input', (_event, data) => {
    if (!isControlling) return;
    peer.send(data);
  });

  ipcMain.on('overlay-lock-lost', () => {
    stopControlling();
  });

  ipcMain.on('overlay-lock-acquired', () => {
    // reservado por si se necesita feedback visual adicional más adelante
  });
});

app.on('window-all-closed', (e) => {
  // Esta app vive en la bandeja del sistema: no debe cerrarse al ocultar la overlay.
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
