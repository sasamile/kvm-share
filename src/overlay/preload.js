const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kvm', {
  sendInput: (data) => ipcRenderer.send('overlay-input', data),
  notifyLockLost: () => ipcRenderer.send('overlay-lock-lost'),
  notifyLockAcquired: () => ipcRenderer.send('overlay-lock-acquired'),
});
