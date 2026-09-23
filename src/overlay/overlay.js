const hint = document.getElementById('hint');
let active = false;
let pendingDx = 0;
let pendingDy = 0;
let rafId = 0;
let hintTimer = null;

function flushMove() {
  rafId = 0;
  if (!active || (pendingDx === 0 && pendingDy === 0)) return;
  const dx = pendingDx;
  const dy = pendingDy;
  pendingDx = 0;
  pendingDy = 0;
  window.kvm.sendInput({ t: 'mousemove', dx, dy });
}

function queueMove(dx, dy) {
  pendingDx += dx;
  pendingDy += dy;
  if (!rafId) rafId = requestAnimationFrame(flushMove);
}

window.kvm.onActiveChange((isActive) => {
  active = isActive;
  pendingDx = 0;
  pendingDy = 0;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }

  if (isActive) {
    hint.style.display = 'block';
    hintTimer = setTimeout(() => {
      hint.style.display = 'none';
    }, 1400);
    // Pointer Lock = movimiento relativo fluido (sin pelear con bordes).
    const tryLock = () => {
      try {
        document.body.requestPointerLock();
      } catch (_) {
        /* ignore */
      }
    };
    tryLock();
    setTimeout(tryLock, 50);
  } else {
    hint.style.display = 'none';
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
});

document.body.addEventListener('click', () => {
  if (active && !document.pointerLockElement) {
    document.body.requestPointerLock();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!active) return;
  if (e.movementX === 0 && e.movementY === 0) return;
  queueMove(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (!active) return;
  e.preventDefault();
  flushMove();
  window.kvm.sendInput({ t: 'mousedown', button: e.button });
});

document.addEventListener('mouseup', (e) => {
  if (!active) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'mouseup', button: e.button });
});

document.addEventListener('wheel', (e) => {
  if (!active) return;
  window.kvm.sendInput({ t: 'wheel', dx: e.deltaX, dy: e.deltaY });
}, { passive: true });

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (!active) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    window.kvm.notifyLockLost();
    return;
  }
  if (e.repeat) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'keydown', code: e.code });
});

document.addEventListener('keyup', (e) => {
  if (!active) return;
  if (e.key === 'Escape') return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'keyup', code: e.code });
});
