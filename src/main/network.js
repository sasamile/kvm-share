const WebSocket = require('ws');
const { EventEmitter } = require('events');

const RECONNECT_DELAY_MS = 2000;

// Envuelve un WebSocket en modo servidor ("listen") o cliente ("connect") con
// reconexión automática, y expone una API simple: send(obj) / evento 'message' / evento 'status'.
class Peer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.socket = null;
    this.connected = false;

    if (config.networkMode === 'listen') {
      this._listen();
    } else {
      this._connect();
    }
  }

  _listen() {
    const wss = new WebSocket.Server({ host: this.config.host, port: this.config.port });
    this.wss = wss;

    wss.on('listening', () => {
      this.emit('status', `Escuchando en ${this.config.host}:${this.config.port}`);
    });
    wss.on('connection', (ws) => {
      this._bind(ws);
      this.emit('status', 'Peer conectado');
    });
    wss.on('error', (err) => {
      this.emit('status', `Error de servidor: ${err.message}`);
    });
  }

  _connect() {
    const url = `ws://${this.config.peerHost}:${this.config.port}`;

    const tryConnect = () => {
      const ws = new WebSocket(url);

      ws.on('open', () => {
        this._bind(ws);
        this.emit('status', `Conectado a ${this.config.peerHost}`);
      });
      ws.on('error', () => {
        // el evento 'close' se dispara justo después; ahí se reintenta.
      });
      ws.on('close', () => {
        if (this.socket === ws) {
          this.connected = false;
          this.socket = null;
        }
        this.emit('status', 'Desconectado, reintentando...');
        setTimeout(tryConnect, RECONNECT_DELAY_MS);
      });
    };

    tryConnect();
  }

  _bind(ws) {
    this.socket = ws;
    this.connected = true;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.emit('message', msg);
    });

    ws.on('close', () => {
      this.connected = false;
      if (this.socket === ws) this.socket = null;
      this.emit('status', 'Peer desconectado');
    });
  }

  send(obj) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(obj));
    }
  }
}

module.exports = { Peer };
