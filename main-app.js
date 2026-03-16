// Constellation Journal — Electron Main Process
// VERITAS Ω Compliant: No external network calls, no telemetry, local-only persistence.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('./src/store');
const EmotionEngine = require('./src/emotion-engine');
const StarNamer = require('./src/star-namer');
const ConstellationEngine = require('./src/constellation-engine');

let mainWindow = null;
let store = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a14',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a14',
      symbolColor: '#6a6a8e',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'renderer', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────
function registerIPC() {
  // Save a journal entry
  ipcMain.handle('entry:save', (_event, { dayOfYear, year, text }) => {
    const emotion = EmotionEngine.analyze(text);
    const starName = StarNamer.generate(emotion);
    const temperature = StarNamer.emotionToTemperature(emotion);
    const color = StarNamer.temperatureToHex(temperature);

    const entry = store.saveEntry({
      dayOfYear,
      year,
      text,
      valence: emotion.valence,
      arousal: emotion.arousal,
      label: emotion.label,
      starName,
      colorHex: color,
      temperatureK: temperature
    });

    // Recompute constellations
    const allEntries = store.getAllEntries(year);
    if (allEntries.length >= 3) {
      const constellations = ConstellationEngine.detect(allEntries);
      store.saveConstellations(year, constellations);
    }

    return entry;
  });

  // Get a single entry
  ipcMain.handle('entry:get', (_event, { dayOfYear, year }) => {
    return store.getEntry(dayOfYear, year);
  });

  // Get all entries for a year
  ipcMain.handle('entry:getAll', (_event, { year }) => {
    return store.getAllEntries(year);
  });

  // Delete an entry
  ipcMain.handle('entry:delete', (_event, { dayOfYear, year }) => {
    store.deleteEntry(dayOfYear, year);
    // Recompute constellations
    const allEntries = store.getAllEntries(year);
    if (allEntries.length >= 3) {
      const constellations = ConstellationEngine.detect(allEntries);
      store.saveConstellations(year, constellations);
    }
    return { success: true };
  });

  // Get constellations
  ipcMain.handle('constellation:getAll', (_event, { year }) => {
    return store.getConstellations(year);
  });

  // Get previous year entries for Longest Night
  ipcMain.handle('entry:getPreviousYear', (_event, { year }) => {
    return store.getAllEntries(year - 1);
  });

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // ── Phase 14: Prophecies (Shielded State) ──
  ipcMain.handle('prophecy:save', (_event, { dayOfYear, year, text }) => {
    return store.saveProphecy(dayOfYear, year, text);
  });
  ipcMain.handle('prophecy:get', (_event, { dayOfYear, year }) => {
    return store.getProphecy(dayOfYear, year);
  });
  ipcMain.handle('prophecy:getAll', (_event, { year }) => {
    return store.getAllProphecies(year);
  });
  ipcMain.handle('prophecy:reveal', (_event, { dayOfYear, year }) => {
    return store.revealProphecy(dayOfYear, year);
  });

  // ── Phase 14: Search (Shielded State) ──
  ipcMain.handle('entry:search', (_event, { year, query }) => {
    return store.searchEntries(year, query);
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  store = new Store();
  registerIPC();
  createWindow();

  // ── Phase 14: Midnight Prophecy Reveal Timer ──
  // Check every 60 seconds if any prophecies should be revealed
  setInterval(() => {
    if (!store || !mainWindow) return;
    const now = new Date();
    const year = now.getFullYear();
    const doy = Math.floor((now - new Date(year, 0, 0)) / 86400000);
    const due = store.getUnrevealedDue(year, doy);
    for (const p of due) {
      store.revealProphecy(p.day_of_year, p.year);
      mainWindow.webContents.send('prophecy:revealed', p);
    }
  }, 60000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
