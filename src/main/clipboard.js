const { clipboard } = require('electron');

const POLL_INTERVAL_MS = 150;

// Sincroniza solo texto por simplicidad (v1). Sondea el portapapeles local
// porque ni macOS ni Windows exponen un evento nativo de "cambio de portapapeles"
// sin módulos nativos adicionales.
function startClipboardSync(peer) {
  let lastText = clipboard.readText();

  const timer = setInterval(() => {
    const text = clipboard.readText();
    if (text !== lastText && text !== '') {
      lastText = text;
      peer.send({ t: 'clipboard', text });
    }
  }, POLL_INTERVAL_MS);

  function applyRemote(text) {
    if (text === lastText) return;
    lastText = text; // evita reenviarlo de vuelta en el próximo sondeo
    clipboard.writeText(text);
  }

  return {
    applyRemote,
    stop: () => clearInterval(timer),
  };
}

module.exports = { startClipboardSync };
