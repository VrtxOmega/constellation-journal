# ✦ Constellation Journal

> **Your year, written in stars.**
> Local only. Nothing leaves your machine. Everything leaves a mark.
> *v2.0 — Emergent Nebula • Bloom • Birth Moment*

![Constellation Journal](https://raw.githubusercontent.com/RJLopezAI/constellation-journal/main/screenshot.png)

Every journal entry becomes a unique star in a 3D sky. Write daily and watch your personal constellation grow over the year. Stars are colored by emotion using real Planck blackbody curves — joy burns blue-white at 30,000K; grief smolders red at 3,000K. Related entries form constellations automatically through k-means clustering and minimum spanning trees.

## Features

### 🌌 Living Sky
- **Photorealistic planets** — 2K textured 3D spheres with real orbital mechanics (Keplerian solver, JPL ephemerides)
- **Saturn's rings** — Ring geometry with Cassini Division gap
- **Moon phases** — Real illumination from elongation data
- **Planet rotation** — Per-planet rates (Jupiter fastest, Venus retrograde)
- **110 Messier deep sky objects** — Galaxies, nebulae, clusters at real RA/Dec positions
- **12 meteor showers** — Radiant markers + animated streak particles, seasonally visible near peak dates
- **Real star catalog** — HYG database subset with B-V color-accurate rendering and scintillation
- **22 constellation stick figures** — IAU patterns connecting named stars with additive glow
- **Milky Way band** — Procedural galactic plane rendering

### 🛰️ Live Celestial Tracker
- **Near-Earth Objects** — NASA NeoWs API, 7-day feed, hazard color coding
- **Sentry impact threats** — CNEOS watch list with Palermo/Torino scale
- **ISS tracking** — Real-time position from Open Notify, blinking sprite + orbital trail
- **Solar weather** — DONKI API: CMEs, flares, geomagnetic storms → aurora curtain overlay

### ✍️ Journal Engine
- **Emotion analysis** — AFINN-165 lexicon, circumplex model (Russell 1980), 15 emotion labels
- **Star naming** — Bayer designation + Latin genitive constellation, deterministic from emotion vector
- **Constellation detection** — K-means clustering with Prim's MST line connections
- **Prophecy system** — Sealed time-capsule messages revealed on their target date
- **Meaning objects** — Visual archetypes (nova bursts, nebula clouds, binary orbits, accretion discs) around emotionally significant entries

### 🔮 Planet Info Panel
- Click any planet → detailed popup with diameter, distance, orbital period, missions, and fun facts
- All 11 bodies: Sun, Moon, Mercury through Pluto

### 🎵 Audio Engine
- Procedural WebAudio: star tones mapped to temperature, typewriter clicks, constellation chimes, ambient drone

### ✨ Visual Effects Engine (v2.0)
- **Bloom post-processing** — UnrealBloomPass pipeline with configurable strength/radius/threshold
- **Emergent nebula** — Each entry's glow corona persists forever; clusters of entries blend into nebula clouds
- **Age-based color** — Recent entries glow bright gold, older entries fade to warm amber (1-year gradient)
- **Birth moment** — Save triggers: 150ms world-freeze → white-hot flash → shockwave ring → nearby star disturbance → corona fade-in
- **Star micro-flicker** — Secondary shader noise layer (±2%) gives stars organic life
- **Depth parallax** — Background stars track camera at 5%, creating infinite depth illusion
- **Cluster gravity** — Corona sprites drift toward cluster centroids over time
- **Context-aware camera breathing** — FOV oscillates differently when idle vs near clusters vs during ignition
- **Panel emergence** — UI panels slide up with 100ms delayed backdrop for a "discovered from space" feel

### 🎥 Screen Recorder
- One-click built-in window recorder (VP9 @ 8 Mbps)
- Ctrl+Shift+R global hotkey
- Saves directly to `.webm` via save dialog

### 🔒 Security
- `contextIsolation: true`, `nodeIntegration: false`
- 100% prepared SQL statements (zero string interpolation)
- Content Security Policy restricting script/connect sources
- Domain validation on all IPC inputs
- All API calls have AbortController timeouts and graceful degradation

## Installation

```bash
git clone https://github.com/RJLopezAI/constellation-journal.git
cd constellation-journal
npm install
npm start
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Electron 34 |
| 3D Engine | Three.js 0.160 |
| Post-Processing | UnrealBloomPass (Three.js addons) |
| Database | better-sqlite3 (WAL mode) |
| Audio | Web Audio API (procedural) |
| APIs | NASA NeoWs, CNEOS Sentry, DONKI, ISS |
| NLP | AFINN-165 lexicon (local, offline) |

## Architecture

```
constellation-journal/
├── main-app.js              # Electron main process + IPC
├── preload.js               # contextBridge API surface
├── src/
│   ├── store.js             # SQLite with prepared statements
│   ├── emotion-engine.js    # AFINN-165 valence/arousal analysis
│   ├── star-namer.js        # Deterministic Bayer designation
│   └── constellation-engine.js  # K-means + Prim's MST
└── renderer/
    ├── app.js               # Scene setup, UI, render loop
    ├── bloom-setup.js       # Post-processing bridge (ESM→global)
    ├── recorder-panel.js    # Built-in VP9 window recorder
    ├── celestial-renderer.js # Planets, NEOs, ISS, solar weather
    ├── orbital-mechanics.js  # Keplerian solver + Moon/Sun
    ├── celestial-tracker.js  # NASA API data layer
    ├── meteor-showers.js     # IMO shower catalog (12 showers)
    ├── meteor-renderer.js    # Streak particle system
    ├── star-catalog.js       # HYG bright star subset
    ├── messier-catalog.js    # All 110 Messier objects
    ├── constellation-lines.js # 22 IAU stick figures
    ├── audio-engine.js       # Procedural WebAudio
    ├── meaning-objects.js    # Visual archetypes layer
    ├── sky-object.js         # Canonical celestial schema
    ├── sky-layer-manager.js  # Layer orchestration engine
    ├── time-engine.js        # Time seek/playback
    └── textures/             # 11 planet JPGs + Saturn ring PNG
```

> *Built with VERITAS Ω discipline. Audited. Frozen.*

## License
MIT License
