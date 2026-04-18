// Constellation Journal — Preload (IPC Bridge)
// Exposes a typed API surface to the renderer. Zero node access in renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('journal', {
  // Entry CRUD
  saveEntry: (id, dayOfYear, year, text) =>
    ipcRenderer.invoke('entry:save', { id, dayOfYear, year, text }),
  getEntriesForDay: (dayOfYear, year) =>
    ipcRenderer.invoke('entry:getForDay', { dayOfYear, year }),
  getAllEntries: (year) =>
    ipcRenderer.invoke('entry:getAll', { year }),
  deleteEntry: (id, year) =>
    ipcRenderer.invoke('entry:delete', { id, year }),
  getLightEcho: (year, text) =>
    ipcRenderer.invoke('entry:lightEcho', { year, text }),

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

  // Phase 14: Prophecies (Shielded State)
  saveProphecy: (dayOfYear, year, text) =>
    ipcRenderer.invoke('prophecy:save', { dayOfYear, year, text }),
  getProphecy: (dayOfYear, year) =>
    ipcRenderer.invoke('prophecy:get', { dayOfYear, year }),
  getAllProphecies: (year) =>
    ipcRenderer.invoke('prophecy:getAll', { year }),
  onProphecyRevealed: (callback) =>
    ipcRenderer.on('prophecy:revealed', (_event, prophecy) => callback(prophecy)),

  // Phase 14: Search (Shielded State)
  searchEntries: (year, query) =>
    ipcRenderer.invoke('entry:search', { year, query })
});

// Screen Recorder bridge
contextBridge.exposeInMainWorld('recorder', {
  getSources: () => ipcRenderer.invoke('recorder:getSources'),
  save: (buffer) => ipcRenderer.invoke('recorder:save', { buffer }),
  onToggle: (callback) => ipcRenderer.on('recorder:toggle', () => callback())
});
