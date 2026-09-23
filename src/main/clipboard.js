const { clipboard } = require('electron');

const POLL_INTERVAL_MS = 400;

function startClipboardSync(peer) {
  let lastText = clipboard.readText();
  let paused = false;

  const timer = setInterval(() => {
    if (paused) return;
    const text = clipboard.readText();
    if (text !== lastText && text !== '') {
      lastText = text;
      peer.send({ t: 'clipboard', text });
    }
  }, POLL_INTERVAL_MS);

  function applyRemote(text) {
    if (text === lastText) return;
    lastText = text;
    clipboard.writeText(text);
  }

  return {
    applyRemote,
    setPaused(value) {
      paused = !!value;
    },
    stop: () => clearInterval(timer),
  };
}

module.exports = { startClipboardSync };
