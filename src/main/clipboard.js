const { clipboard, powerSaveBlocker } = require('electron');

const POLL_INTERVAL_MS = 700;

// Sincroniza solo texto por simplicidad (v1). Sondea el portapapeles local
// porque ni macOS ni Windows exponen un evento nativo de "cambio de portapapeles"
// sin módulos nativos adicionales.
function startClipboardSync(peer) {
  let lastText = clipboard.readText();

  // Sin ventana visible ni dock, macOS mete la app en App Nap y congela los
  // timers en segundo plano (p. ej. al bloquear la pantalla), deteniendo el
  // sondeo del portapapeles. Este bloqueador evita esa suspensión.
  const powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');

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
    stop: () => {
      clearInterval(timer);
      if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
      }
    },
  };
}

module.exports = { startClipboardSync };
