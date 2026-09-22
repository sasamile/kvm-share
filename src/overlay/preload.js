const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kvm', {
  sendInput: (data) => ipcRenderer.send('overlay-input', data),
  notifyLockLost: () => ipcRenderer.send('overlay-lock-lost'),
  onActiveChange: (cb) => {
    ipcRenderer.on('overlay-active', (_e, active) => cb(!!active));
  },
});
