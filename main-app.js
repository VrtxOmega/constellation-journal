// Constellation Journal — Electron Main Process
// VERITAS Ω Compliant: No external network calls, no telemetry, local-only persistence.

const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

  // Screen Recorder (Phase 13)
  ipcMain.handle('getDesktopSourceId', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const winSource = sources.find(s => s.name === 'Constellation Journal') || sources[0];
    return winSource ? winSource.id : null;
  });

  ipcMain.handle('saveRecording', async (_event, arrayBuffer) => {
    const oneDriveDesktop = path.join(os.homedir(), 'OneDrive', 'Desktop');
    const outPath = path.join(oneDriveDesktop, 'constellation-demo.webm');
    fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
    return outPath;
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  store = new Store();
  registerIPC();
  createWindow();
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
