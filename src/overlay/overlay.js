const hint = document.getElementById('hint');
let active = false;

window.kvm.onActiveChange((isActive) => {
  active = isActive;
  hint.style.display = isActive ? 'block' : 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!active) return;
  if (e.movementX === 0 && e.movementY === 0) return;
  window.kvm.sendInput({ t: 'mousemove', dx: e.movementX, dy: e.movementY });
});

document.addEventListener('mousedown', (e) => {
  if (!active) return;
  e.preventDefault();
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
