// Constellation Journal — Electron Main Process
// VERITAS Ω Compliant: No external network calls, no telemetry, local-only persistence.

const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, globalShortcut } = require('electron');
const fs = require('fs');
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
  ipcMain.handle('entry:save', async (_event, { dayOfYear, year, text }) => {
    // Domain validation (VERITAS Ω: bounded inputs)
    if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) throw new Error('DOMAIN_VIOLATION: dayOfYear');
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('DOMAIN_VIOLATION: year');
    if (!text || typeof text !== 'string' || text.length > 10000) throw new Error('DOMAIN_VIOLATION: text');

    const emotion = EmotionEngine.analyze(text);
    const starName = StarNamer.generate(emotion);
    const temperature = StarNamer.emotionToTemperature(emotion);
    const color = StarNamer.temperatureToHex(temperature);

    const entry = await store.saveEntry({
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
      await store.saveConstellations(year, constellations);
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
  ipcMain.handle('entry:delete', async (_event, { dayOfYear, year }) => {
    await store.deleteEntry(dayOfYear, year);
    // Recompute constellations
    const allEntries = store.getAllEntries(year);
    if (allEntries.length >= 3) {
      const constellations = ConstellationEngine.detect(allEntries);
      await store.saveConstellations(year, constellations);
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
  ipcMain.handle('prophecy:save', async (_event, { dayOfYear, year, text }) => {
    return await store.saveProphecy(dayOfYear, year, text);
  });
  ipcMain.handle('prophecy:get', (_event, { dayOfYear, year }) => {
    return store.getProphecy(dayOfYear, year);
  });
  ipcMain.handle('prophecy:getAll', (_event, { year }) => {
    return store.getAllProphecies(year);
  });
  ipcMain.handle('prophecy:reveal', async (_event, { dayOfYear, year }) => {
    return await store.revealProphecy(dayOfYear, year);
  });

  // ── Phase 14: Search (Shielded State) ──
  ipcMain.handle('entry:search', (_event, { year, query }) => {
    return store.searchEntries(year, query);
  });

  // ── WSPR live data (routed through main process to bypass CORS) ──
  ipcMain.handle('wspr:fetchSpots', async (_event, { minutes }) => {
    try {
      const url = `https://www.wsprnet.org/drupal/wsprnet/spots/json?minutes=${minutes || 10}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { error: `API ${res.status}`, spots: [] };
      const data = await res.json();
      return { spots: Array.isArray(data) ? data : [] };
    } catch (err) {
      console.warn('[WSPR] Fetch failed:', err);
      return { error: err.message, spots: [] };
    }
  });

  // ── Screen Recorder IPC ──────────────────────────────────────
  ipcMain.handle('recorder:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith('screen:')
    }));
  });

  ipcMain.handle('recorder:save', async (_event, { buffer }) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Recording',
      defaultPath: `recording-${Date.now()}.webm`,
      filters: [{ name: 'Video', extensions: ['webm'] }]
    });
    if (!filePath) return { saved: false };
    await fs.promises.writeFile(filePath, Buffer.from(buffer));
    return { saved: true, path: filePath };
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  store = new Store();
  registerIPC();
  createWindow();

  // Global hotkey: Ctrl+Shift+R to toggle recording
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) mainWindow.webContents.send('recorder:toggle');
  });

  // ── Phase 14: Midnight Prophecy Reveal Timer ──
  // Check every 60 seconds if any prophecies should be revealed
  setInterval(async () => {
    if (!store || !mainWindow) return;
    const now = new Date();
    const year = now.getFullYear();
    const doy = Math.floor((now - new Date(year, 0, 0)) / 86400000);
    const due = store.getUnrevealedDue(year, doy);
    for (const p of due) {
      await store.revealProphecy(p.day_of_year, p.year);
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
