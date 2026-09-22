const test = require('node:test');
const assert = require('node:assert/strict');

// `clipboard.js` hace `require('electron')`. Fuera de un proceso Electron ese
// paquete no expone la API real, así que sustituimos la entrada del cache de
// módulos por un mock antes de cargar el archivo bajo prueba.
function loadClipboardModule(electronMock) {
  const resolved = require.resolve('electron');
  const original = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: electronMock };

  const clipboardPath = require.resolve('../src/main/clipboard.js');
  delete require.cache[clipboardPath];
  const mod = require('../src/main/clipboard.js');
  delete require.cache[clipboardPath];

  if (original) {
    require.cache[resolved] = original;
  } else {
    delete require.cache[resolved];
  }

  return mod;
}

function makeElectronMock(initialClipboardText) {
  let clipboardText = initialClipboardText;
  const startedBlockers = new Set();
  let nextBlockerId = 1;

  return {
    clipboard: {
      readText: () => clipboardText,
      writeText: (text) => {
        clipboardText = text;
      },
    },
    powerSaveBlocker: {
      start: (type) => {
        assert.equal(type, 'prevent-app-suspension');
        const id = nextBlockerId++;
        startedBlockers.add(id);
        return id;
      },
      isStarted: (id) => startedBlockers.has(id),
      stop: (id) => startedBlockers.delete(id),
    },
    _startedBlockers: startedBlockers,
  };
}

test('startClipboardSync bloquea la suspensión de la app para que el sondeo no se detenga al bloquear la pantalla', () => {
  const electronMock = makeElectronMock('inicial');
  const peer = { send: () => {} };

  const { startClipboardSync } = loadClipboardModule(electronMock);
  const sync = startClipboardSync(peer);

  assert.equal(electronMock._startedBlockers.size, 1, 'debe iniciar un powerSaveBlocker al arrancar el sondeo');

  sync.stop();

  assert.equal(electronMock._startedBlockers.size, 0, 'debe liberar el powerSaveBlocker al detener el sondeo');
});

test('applyRemote escribe el texto remoto y evita reenviarlo en el próximo sondeo', () => {
  const electronMock = makeElectronMock('inicial');
  const sent = [];
  const peer = { send: (msg) => sent.push(msg) };

  const { startClipboardSync } = loadClipboardModule(electronMock);
  const sync = startClipboardSync(peer);

  sync.applyRemote('desde el otro equipo');

  assert.equal(electronMock.clipboard.readText(), 'desde el otro equipo');

  sync.stop();
});
