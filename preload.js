// Constellation Journal — Preload (IPC Bridge)
// Exposes a typed API surface to the renderer. Zero node access in renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('journal', {
  // Entry CRUD
  saveEntry: (dayOfYear, year, text) =>
    ipcRenderer.invoke('entry:save', { dayOfYear, year, text }),
  getEntry: (dayOfYear, year) =>
    ipcRenderer.invoke('entry:get', { dayOfYear, year }),
  getAllEntries: (year) =>
    ipcRenderer.invoke('entry:getAll', { year }),
  deleteEntry: (dayOfYear, year) =>
    ipcRenderer.invoke('entry:delete', { dayOfYear, year }),

  // Constellations
  getConstellations: (year) =>
    ipcRenderer.invoke('constellation:getAll', { year }),

  // Longest Night
  getPreviousYearEntries: (year) =>
    ipcRenderer.invoke('entry:getPreviousYear', { year }),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Screen Recorder
  getDesktopSourceId: () => ipcRenderer.invoke('getDesktopSourceId'),
  saveRecording: (buffer) => ipcRenderer.invoke('saveRecording', buffer)
});
