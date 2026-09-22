const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { CONFIG_PATH } = require('./config');

function createTray({ onQuit }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray-icon.png'));
  const tray = new Tray(icon);
  tray.setToolTip('KVM Share');

  const menu = Menu.buildFromTemplate([
    { id: 'network-status', label: 'Red: iniciando...', enabled: false },
    { id: 'control-status', label: 'Control: local', enabled: false },
    { type: 'separator' },
    { label: 'Abrir config.json', click: () => shell.openPath(CONFIG_PATH) },
    { type: 'separator' },
    { label: 'Salir', click: onQuit },
  ]);
  tray.setContextMenu(menu);

  function setNetworkStatus(text) {
    menu.items[0].label = `Red: ${text}`;
    tray.setContextMenu(menu);
  }

  function setControlStatus(text) {
    menu.items[1].label = `Control: ${text}`;
    tray.setContextMenu(menu);
  }

  return { tray, setNetworkStatus, setControlStatus };
}

module.exports = { createTray };
