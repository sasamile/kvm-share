const { Tray, Menu, nativeImage, shell } = require('electron');
const os = require('os');
const path = require('path');
const { CONFIG_PATH } = require('./config');

function localIPv4s() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function createTray({ config, onQuit }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray-icon.png'));
  const tray = new Tray(icon);
  const state = { network: 'iniciando...', control: 'local' };

  // En macOS cambiar el label de un MenuItem ya construido no se refleja,
  // así que el menú se reconstruye en cada cambio de estado.
  function render() {
    const ips = localIPv4s();
    const modeLabel = config.networkMode === 'listen'
      ? `Modo: listen (puerto ${config.port})`
      : `Modo: connect → ${config.peerHost}:${config.port}`;

    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Red: ${state.network}`, enabled: false },
      { label: `Control: ${state.control}`, enabled: false },
      { type: 'separator' },
      { label: modeLabel, enabled: false },
      { label: `Mi IP: ${ips.length ? ips.join(', ') : 'sin red'}`, enabled: false },
      { label: `Borde peer: ${config.peerEdge || 'right'}`, enabled: false },
      { label: `Volver: ${config.controlHotkey}`, enabled: false },
      { type: 'separator' },
      { label: 'Abrir config.json', click: () => shell.openPath(CONFIG_PATH) },
      { type: 'separator' },
      { label: 'Salir', click: onQuit },
    ]));
    tray.setToolTip(`KVM Share — ${state.network}`);
  }

  render();

  return {
    tray,
    setNetworkStatus(text) {
      state.network = text;
      console.log(`[red] ${text}`);
      render();
    },
    setControlStatus(text) {
      state.control = text;
      console.log(`[control] ${text}`);
      render();
    },
  };
}

module.exports = { createTray };
