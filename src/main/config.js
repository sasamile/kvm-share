const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const DEFAULT_CONFIG = {
  // "listen": esta máquina abre un servidor WebSocket y espera la conexión de la otra.
  // "connect": esta máquina se conecta a la IP de la que está en modo "listen".
  networkMode: 'listen',
  host: '0.0.0.0',
  port: 42420,
  peerHost: '192.168.1.50',

  // Atajo para "tomar el control" y empezar a enviar mouse/teclado a la otra máquina.
  // Para soltar el control simplemente se presiona Escape (libera el Pointer Lock).
  controlHotkey: 'Control+Alt+K',
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    console.error('No se pudo leer config.json, usando valores por defecto:', err);
    return { ...DEFAULT_CONFIG };
  }
}

module.exports = { loadConfig, CONFIG_PATH };
