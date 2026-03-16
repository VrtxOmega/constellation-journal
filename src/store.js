// Constellation Journal — SQLite Store
// VERITAS Ω: Prepared statements only. No string interpolation in queries.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class Store {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'constellation-journal.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._initSchema();
    this._prepareStatements();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_year INTEGER NOT NULL,
        year INTEGER NOT NULL,
        date TEXT NOT NULL,
        text TEXT NOT NULL,
        emotion_valence REAL NOT NULL,
        emotion_arousal REAL NOT NULL,
        emotion_label TEXT NOT NULL,
        star_name TEXT NOT NULL,
        star_color_hex TEXT NOT NULL,
        star_temperature_k REAL NOT NULL,
        embedding TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(day_of_year, year)
      );

      CREATE TABLE IF NOT EXISTS constellations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        name TEXT NOT NULL,
        theme TEXT NOT NULL,
        star_ids_json TEXT NOT NULL,
        line_pairs_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_entries_year ON entries(year);
      CREATE INDEX IF NOT EXISTS idx_constellations_year ON constellations(year);
    `);

    // Schema migration: Add embedding column to existing tables
    const tableInfo = this.db.pragma('table_info(entries)');
    if (!tableInfo.find(c => c.name === 'embedding')) {
      this.db.exec('ALTER TABLE entries ADD COLUMN embedding TEXT;');
    }

    // Phase 14: Prophecies table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prophecies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_year INTEGER NOT NULL,
        year INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        revealed INTEGER NOT NULL DEFAULT 0,
        UNIQUE(day_of_year, year)
      );
      CREATE INDEX IF NOT EXISTS idx_prophecies_year ON prophecies(year);
    `);
  }

  _prepareStatements() {
    this._stmts = {
      // ── Entries (Shielded: prepared only) ──
      insertEntry: this.db.prepare(`
        INSERT OR REPLACE INTO entries
          (day_of_year, year, date, text, emotion_valence, emotion_arousal,
           emotion_label, star_name, star_color_hex, star_temperature_k, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getEntry: this.db.prepare(`
        SELECT * FROM entries WHERE day_of_year = ? AND year = ?
      `),
      getAllEntries: this.db.prepare(`
        SELECT * FROM entries WHERE year = ? ORDER BY day_of_year ASC
      `),
      deleteEntry: this.db.prepare(`
        DELETE FROM entries WHERE day_of_year = ? AND year = ?
      `),
      searchEntries: this.db.prepare(`
        SELECT * FROM entries WHERE year = ? AND text LIKE ? ORDER BY day_of_year ASC
      `),

      // ── Constellations (Shielded: prepared only) ──
      deleteConstellations: this.db.prepare(`
        DELETE FROM constellations WHERE year = ?
      `),
      insertConstellation: this.db.prepare(`
        INSERT INTO constellations (year, name, theme, star_ids_json, line_pairs_json)
        VALUES (?, ?, ?, ?, ?)
      `),
      getConstellations: this.db.prepare(`
        SELECT * FROM constellations WHERE year = ?
      `),

      // ── Prophecies (Shielded: prepared only, bounded domain) ──
      insertProphecy: this.db.prepare(`
        INSERT OR REPLACE INTO prophecies (day_of_year, year, text)
        VALUES (?, ?, ?)
      `),
      getProphecy: this.db.prepare(`
        SELECT * FROM prophecies WHERE day_of_year = ? AND year = ?
      `),
      getAllProphecies: this.db.prepare(`
        SELECT * FROM prophecies WHERE year = ? ORDER BY day_of_year ASC
      `),
      revealProphecy: this.db.prepare(`
        UPDATE prophecies SET revealed = 1 WHERE day_of_year = ? AND year = ?
      `),
      getUnrevealedDue: this.db.prepare(`
        SELECT * FROM prophecies WHERE year = ? AND day_of_year <= ? AND revealed = 0
      `)
    };
  }

  // ── High Assurance: Auto-Backup ──
  _backupDb() {
    try {
      const backupPath = this.db.name + '.backup';
      fs.copyFileSync(this.db.name, backupPath);
    } catch (err) {
      console.error("Critical: Failed to pre-backup WAL ledger.", err);
    }
  }

  saveEntry({ dayOfYear, year, text, valence, arousal, label, starName, colorHex, temperatureK, embedding }) {
    this._backupDb(); // Shielded State: Commit safe-point

    const date = new Date();
    date.setFullYear(year);
    date.setMonth(0, 1);
    date.setDate(dayOfYear);
    const dateStr = date.toISOString().split('T')[0];
    const embeddingStr = embedding ? JSON.stringify(embedding) : null;

    this._stmts.insertEntry.run(
      dayOfYear, year, dateStr, text,
      valence, arousal, label,
      starName, colorHex, temperatureK, embeddingStr
    );

    return this.getEntry(dayOfYear, year);
  }

  getEntry(dayOfYear, year) {
    const entry = this._stmts.getEntry.get(dayOfYear, year) || null;
    if (entry && entry.embedding) {
      entry.embedding = JSON.parse(entry.embedding);
    }
    return entry;
  }

  getAllEntries(year) {
    const entries = this._stmts.getAllEntries.all(year);
    for (const entry of entries) {
      if (entry.embedding) entry.embedding = JSON.parse(entry.embedding);
    }
    return entries;
  }

  deleteEntry(dayOfYear, year) {
    this._backupDb(); // Shielded State: Commit safe-point
    this._stmts.deleteEntry.run(dayOfYear, year);
  }

  saveConstellations(year, constellations) {
    this._backupDb(); // Shielded State: Commit safe-point
    const transaction = this.db.transaction((consts) => {
      this._stmts.deleteConstellations.run(year);
      for (const c of consts) {
        this._stmts.insertConstellation.run(
          year, c.name, c.theme,
          JSON.stringify(c.starDays),
          JSON.stringify(c.linePairs)
        );
      }
    });
    transaction(constellations);
  }

  getConstellations(year) {
    const rows = this._stmts.getConstellations.all(year);
    return rows.map(r => ({
      ...r,
      starDays: JSON.parse(r.star_ids_json),
      linePairs: JSON.parse(r.line_pairs_json)
    }));
  }

  // ── Phase 14: Prophecies (Shielded State) ──
  saveProphecy(dayOfYear, year, text) {
    // Bounded domain: dayOfYear ∈ [1,365], year ∈ [2000,2100], text ≤ 10000 chars
    if (dayOfYear < 1 || dayOfYear > 365) throw new Error('DOMAIN_VIOLATION: dayOfYear');
    if (year < 2000 || year > 2100) throw new Error('DOMAIN_VIOLATION: year');
    if (!text || text.length > 10000) throw new Error('DOMAIN_VIOLATION: text');

    this._backupDb(); // Shielded State: Commit safe-point
    this._stmts.insertProphecy.run(dayOfYear, year, text);
    return this.getProphecy(dayOfYear, year);
  }

  getProphecy(dayOfYear, year) {
    return this._stmts.getProphecy.get(dayOfYear, year) || null;
  }

  getAllProphecies(year) {
    return this._stmts.getAllProphecies.all(year);
  }

  revealProphecy(dayOfYear, year) {
    this._backupDb(); // Shielded State: Commit safe-point
    this._stmts.revealProphecy.run(dayOfYear, year);
    return this.getProphecy(dayOfYear, year);
  }

  getUnrevealedDue(year, todayDOY) {
    return this._stmts.getUnrevealedDue.all(year, todayDOY);
  }

  // ── Phase 14: Search (Shielded State) ──
  searchEntries(year, query) {
    if (!query || query.length > 500) return [];
    // Parameterized LIKE — no string interpolation
    return this._stmts.searchEntries.all(year, `%${query}%`);
  }
}

module.exports = Store;
