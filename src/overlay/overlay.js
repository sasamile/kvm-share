const hint = document.getElementById('hint');
let locked = false;

document.body.addEventListener('click', () => {
  if (!locked) document.body.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === document.body;
  hint.style.display = locked ? 'none' : 'block';
  if (locked) {
    window.kvm.notifyLockAcquired();
  } else {
    // Esc (u otra causa) liberó el lock: se entiende como "devolver el control".
    window.kvm.notifyLockLost();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  if (e.movementX === 0 && e.movementY === 0) return;
  window.kvm.sendInput({ t: 'mousemove', dx: e.movementX, dy: e.movementY });
});

document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'mousedown', button: e.button });
});

document.addEventListener('mouseup', (e) => {
  if (!locked) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'mouseup', button: e.button });
});

document.addEventListener('wheel', (e) => {
  if (!locked) return;
  window.kvm.sendInput({ t: 'wheel', dx: e.deltaX, dy: e.deltaY });
}, { passive: true });

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (!locked) return;
  if (e.repeat) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'keydown', code: e.code });
});

document.addEventListener('keyup', (e) => {
  if (!locked) return;
  e.preventDefault();
  window.kvm.sendInput({ t: 'keyup', code: e.code });
});
