# Constellation Journal — Complete Visual & Technical Context for LLMs

> **Purpose of this document**: You are receiving this because the developer cannot send you screenshots or screen recordings. This document describes the application with enough visual and technical precision that you can reason about it, suggest improvements, and write code for it as if you were looking at it.

---

## 1. What It Is

Constellation Journal is a **desktop Electron app** (Node.js + Three.js) that reimagines a daily journal as a 3D star sphere. Every day of the year is a star (365 total) arranged on a sphere using Fibonacci distribution. When you write a journal entry, that day's star ignites — changing color, growing in size, and emitting a glowing corona. Over a full year, your sky fills with the light of your own words.

The app is **fully local** — SQLite database, no cloud, no accounts. Data stays on disk.

---

## 2. The Visual Scene (What You Would See)

### 2.1 Background Color
- **`#060610`** — an extremely dark navy-black void. Not pure black; it has a slight blue-purple warmth. This is the canvas everything renders on top of.

### 2.2 Layer Stack (back to front, by renderOrder)
The 3D scene renders **inside-out** — the camera sits at the center of concentric spheres looking outward:

| Layer | renderOrder | Radius | What It Is |
|-------|-------------|--------|------------|
| Background stars | -3 | 90-160 | ~5,400 points (1,400 from real HYG star catalog + 4,000 random fillers) |
| Decorative nebula | -2 | 120 | BackSide sphere with Perlin noise shader in purple/teal/rose/blue |
| Milky Way band | -1 | 93-105 | 6,000 particles along a tilted great circle (galactic plane at 63°) |
| Nebula fog (Phase 14) | 0 | 48 | BackSide sphere with simplex noise, clears around written stars |
| 365 journal stars | default | 50 | The primary interactive layer — Fibonacci sphere of 365 star points |
| Calendar ring | default | 52 | Thin ring of month markers at the equator |
| Constellation lines | default | 50 | Real constellation line segments (Orion, Ursa Major, etc.) |
| Planets | default | varies | Small colored spheres for Mars, Jupiter, Saturn, Venus near real positions |
| Coronas | default | 50 | Additive-blend sprite halos around recently-written stars |
| Deep-sky objects | default | varies | Sprite textures at real Messier object positions (M31, M42, etc.) |

### 2.3 Background Stars (HYG Catalog + Fillers)
- **Real stars**: Positioned using RA/Dec from the HYG stellar catalog, converted to 3D via `celestialToXYZ()`. Colors derived from B-V color index (blue-white Vega, yellow Sun, red Betelgeuse). Sizes scaled by apparent magnitude: Sirius = 8px, Vega = 5px, magnitude 4 = 1px.
- **Filler stars**: 4,000 random points at radius 95-160. Slightly blue-tinted white (`0.6-0.95` RGB). Sizes 0.4-1.0.
- **Shader effects**:
  - **Dual-rate twinkle**: Each star scintillates at two independent sine frequencies (0.3-1.1 Hz primary, 0.1-0.4 Hz modulation), producing natural twinkling that varies from 55% to 100% brightness.
  - **Diffraction spikes**: Stars with `starSize > 3.0` render 4-point cross diffraction patterns (horizontal and vertical bars through the point center), simulating telescope optics. Intensity scales with size.
  - **Fragment shader**: Bright core (smoothstep 0→0.45), wider glow halo (0→0.1), and additive diffraction cross.

### 2.4 Decorative Nebula (Outer Shell)
- A sphere at radius 120 rendered on `BackSide` (you see its inner surface).
- **4-color palette**: vivid purple (`#3a0a5e`), deep teal (`#0a4a4a`), warm rose (`#5a1a30`), deep blue (`#1a2a5a`).
- **5-octave FBM** (Fractional Brownian Motion) noise with **domain warping** — the noise coordinates are themselves offset by noise, producing organic swirling shapes that drift slowly over time.
- Alpha: ~0.22 with smoothstep masking. Subtle — you see it as faint color wash regions in the background, not as a solid surface.

### 2.5 Milky Way Band
- 6,000 particles distributed along a great circle tilted at 63° and rotated 123° in longitude (matching the real galactic plane as seen from Earth).
- **Spread**: Core band with ±20 unit random displacement laterally, ±12 vertically. This creates a diffuse band ~40 units wide.
- **Colors**: Per-vertex coloring. Core particles (`|spread| < 6`) are brighter blue-white (R:0.75-1.0, G:0.70-0.95, B:0.80-1.0). Edge particles fade to dimmer purple tones (R:0.55-0.80, G:0.50-0.70, B:0.65-0.95).
- **Rendering**: Additive blending, 0.18 opacity, 32px radial gradient sprite texture (bright center fading to transparent edge). Size 0.4-1.4.
- **Visual result**: A luminous band of thousands of tiny glowing dots arcing across the sky, denser and brighter at center, diffusing at edges. Looks like an actual photograph of the Milky Way rendered in pointillism.

### 2.6 Journal Stars (The 365 Interactive Stars)
- **Position**: 365 points on a Fibonacci sphere at radius 50. Evenly distributed — no clustering.
- **Empty stars** (unwritten days): Muted blue-gray (`#6070a8`), size 3.5, alpha 0.55 with gentle twinkle. They look like dim, distant stars.
- **Written stars** (days with entries): Colored by emotion analysis of the text. The `EmotionEngine` maps text to valence/arousal/dominance, which `StarNamer` converts to a star temperature (2000K-30000K), which maps to a color:
  - Very negative/intense → cool red-orange (low temperature)
  - Neutral/calm → warm yellow-white (medium temperature, like our Sun)
  - Very positive/energetic → hot blue-white (high temperature)
  - Size scales with text length: base 5.0 + up to 3.0 more for longer entries (capped at 2000 chars).
- **Redshift aging** (Phase 9): Over months, star colors gradually shift toward warmer/redder tones (max 15% at 6 months), mimicking cosmological redshift. New entries are vivid; old entries warm.
- **Shader effects**:
  - Gentle twinkle (0.7 + 0.3*sin) for all stars
  - **Pulsar mode** (Phase 14 prophecy stars): Rapid sharp amber pulsing at 6 Hz with `pow(abs(sin), 4.0)` for sharp beats. Color mixed 50% with gold `(0.83, 0.69, 0.22)`.
  - **Hover pulse**: Hovered star animates at 4 Hz with 40% size boost.
  - **Search dim**: During search, non-matching stars dim to 15% (`searchMult = 0.15`).
- **Fragment shader**: Bright inner core (smoothstep 0→0.12), wide glow halo (smoothstep 0→0.45), outer bloom (0.2→0.5), and a cross-shaped diffraction pattern (two perpendicular bars, 0.2 intensity). Written stars have a bright white center with colored halo. The overall effect is that written stars look like actual bright stars with diffraction spikes, while empty stars are simple dim dots.

### 2.7 Nebula Fog / Clearing (Phase 14)
- A sphere at `SPHERE_RADIUS - 2` (radius 48), rendered on BackSide with AdditiveBlending.
- **3D Simplex noise** (Ashima's implementation): 3 octaves at spatial frequency 0.08, drifting slowly with time.
- **Clear mask**: A 365-pixel RGBA DataTexture. Each pixel represents one star day. R=255 if that day has an entry (cleared), R=0 if not (foggy).
- **Effect**: Unwritten star regions have a subtle additive blue-purple glow (deep `(0.10, 0.04, 0.18)`). As you write entries, the fog dissolves around those star positions. The fog is very subtle (opacity 0.06) — it doesn't obscure the sky but adds a faint volumetric depth.
- **Gamification**: Footer shows "X% sky cleared" — how much of the 365-day sky has been written.

### 2.8 Corona Effect
- When you write a new entry, an additive-blend sprite appears at the star's position. 128x128 pixel canvas-drawn radial gradient: bright white center → 50% at 15% → 12% at 40% → 3% at 70% → transparent at edge.
- **Color**: Matched to the star's emotion color.
- **Size**: Starts at scale 10, expands to 14 over 24 hours while fading.
- **Breathing animation**: Gentle sine-wave pulsing at 0.003 Hz (`1.0 + 0.15 * sin(elapsed * 0.003)`).
- **Duration**: 24 hours, then it fades out and is removed.
- **Visual result**: New entries have a large, softly pulsing colored halo around them — like a newly-born star still surrounded by its nebula.

### 2.9 Constellation Lines
- Connects stars that share emotional similarities (auto-detected by the `EmotionEngine`): if 3+ entries within a 7-day window share valence/arousal proximity, they form a "constellation."
- **Rendering**: Thin white lines at low opacity connecting the star positions. Animated fade-in when first detected.
- **Legend**: A glassmorphism panel in the top-right corner lists constellation names (auto-generated: "The Serene Bridge", "The Burning Path", etc.) with colored dots.

---

## 3. UI Components (What You'd Interact With)

### 3.1 Title Bar
- Custom frameless Electron title bar with `-webkit-app-region: drag`.
- Left: gold `✦` icon + "Constellation Journal" in 12px muted gray.
- Right: icon buttons for Search (🔍), Settings (⚙), Constellation toggle (✧), Sound toggle (🔇), then standard Minimize/Maximize/Close.
- Background: `rgba(10, 10, 20, 0.6)` with `backdrop-filter: blur(10px)`.

### 3.2 Write Button
- Centered at the bottom of the screen: a pill-shaped button "✦ Write" in gold (`#c9b06b`).
- Glassmorphism: `rgba(12, 12, 28, 0.88)` background with `blur(20px)`, gold border glow, rounded 24px corners.
- Hover: lifts 2px, emits a subtle gold box-shadow (`30px + 60px` spread).

### 3.3 Write Panel
- Slides up from the bottom (CSS animation `slidePanelUp` with cubic-bezier spring).
- 700px max width, glassmorphism panel with rounded top corners (20px).
- Header: "✦ Write" gold title + date + word count.
- Body: Transparent textarea with monospace font (`Cascadia Code` / `JetBrains Mono`), warm white text (`#f0e6d3`), gold caret, 1.8 line-height.
- Footer: Typewriter sounds toggle checkbox, Cancel (ghosted) and "Save to the sky ✦" (gold gradient) buttons.
- Backdrop: 40% dark overlay behind the panel.

### 3.4 Entry Overlay (Reading Back an Entry)
- Click a written star → camera flies to it (1.5s easeOutCubic tween) → entry overlay scales in from 0.3→1.0 (spring animation, 0.5s).
- 600px max width, centered, glassmorphism panel.
- Header: Colored dot matching the star color + star name (e.g., "Velara Prime") + date + emotion label (e.g., "contemplative calm").
- Body: The journal text in monospace, warm white, 1.8 line-height. Paragraphs fade in sequentially with `fadeInParagraph` animation (0.6s staggered).
- Close button: "✦ Close" in a pill-shaped outlined button.

### 3.5 Star Tooltip (Hover)
- When hovering over any star (written or empty), a small glassmorphism tooltip appears near the cursor.
- Shows: Day number ("Day 75"), full date ("Sunday, March 16, 2026"), and status ("unwritten" or the emotion label).
- Star name in gold if written.

### 3.6 Search Panel (Phase 14)
- Opens from the top-center on `Ctrl+F` or 🔍 click. Glassmorphism panel, 460px wide.
- Text input with placeholder "Search your sky..."
- Live search: as you type, results appear below as clickable items showing day number + date + text preview.
- **Visual effects**: Matching stars brighten and grow; non-matching stars dim to 15%. Camera tweens to the centroid of matches. Gold filament lines (LineSegments, `#d4af37`, 35% opacity, additive blend) connect all matching stars.

### 3.7 Prophecy Panel (Phase 14)
- Click a **future** star (day after today) → centered glassmorphism panel appears at screen center (`top:50%;left:50%;transform:translate(-50%,-50%)`).
- Header: "✦ Prophecy" in gold + date.
- Body: Textarea "Write a message to your future self..."
- Buttons: Cancel (ghosted) + "Seal Prophecy ✦" (gold).
- After sealing: star becomes a **pulsar** (rapid amber pulsing), panel shows 🔮 "Sealed until this day arrives."
- When the day arrives: main process auto-reveals at midnight, triggers a **48-particle supernova burst** (radial explosion, 3-second fade), then shows the revealed text.

### 3.8 Settings Panel
- Glassmorphism panel centered on screen. Contains:
  - Star brightness slider (range input with gold thumb)
  - Twinkle speed slider
  - Auto-rotate toggle (switch with gold/gray states)
  - Export/Import JSON buttons
  - Danger zone: "🗑 Clear All Data" button (red accent)

### 3.9 Calendar Footer
- Just above the Write button: "MARCH 16, 2026 · 3 / 365 STARS LIT · 1% sky cleared" in tiny dimmed uppercase letters (10px, `#4a4a6a`).

### 3.10 Onboarding
- First launch: centered panel with ✦ icon, "Welcome to Constellation Journal", feature list (🌟 Write daily, 🖱️ Drag to orbit, ✨ Stars age and redshift, 🔭 Real stars surround you), and "Begin ✦" button.

---

## 4. Interactions & Animations

### 4.1 Camera Controls
- **Drag**: Click and drag on the 3D canvas → orbits the sphere (spherical coordinates: theta for horizontal, phi for vertical).
- **Scroll**: Zoom in/out (radius 20→200).
- **Auto-rotate**: Very slow continuous rotation (0.00001 rad/frame) when enabled and not interacting.
- **Fly-to**: Clicking a star triggers a smooth 1.5-second tween (easeOutCubic) from current position to face the clicked star, zooming in slightly (radius -15).
- **Home key** (`H`): Instantly resets to theta=0, phi=π/2, radius=85 (the default "front" view of the sphere).

### 4.2 Star Ignition (Writing an Entry)
1. Save entry → star color changes instantly to the emotion-mapped color.
2. Star size grows to 5.0 + text_length_bonus.
3. A **corona sprite** appears (large, colored, breathing glow).
4. A **star tone** plays (Web Audio API: sine oscillator → gain envelope, frequency mapped from star temperature).
5. If 3+ nearby entries form an emotional cluster → **constellation lines** animate in and a **constellation chime** plays (random harmonics from C major).
6. Nebula fog clears around this star position.

### 4.3 Light Echo (Phase 10)
- Clicking an older written star triggers a **light echo**: 32 particles expanding outward from the star position in a ring, fading over 3 seconds. Like the visual of a supernova remnant expanding.

### 4.4 Longest Night (Phase 7)
- On December 21 (winter solstice), a special banner appears: "✦ The Longest Night ✦ / Your whole year illuminated" in gold, with enhanced ambient lighting as a celebration of completing most of the year.

---

## 5. Architecture

```
Electron Main Process (main-app.js)
├── SQLite DB via better-sqlite3 (store.js)
│   ├── entries table (day_of_year, year, text, star_color_hex, star_name, etc.)
│   ├── constellations table
│   └── prophecies table (Phase 14)
├── EmotionEngine (emotion-engine.js) — NRC/AFINN lexicon analysis
├── StarNamer (star-namer.js) — procedural star name generation
└── IPC Handlers (entry:save, entry:getAll, prophecy:save, etc.)

Preload Bridge (preload.js)
└── contextBridge.exposeInMainWorld('journal', { ... })

Renderer (renderer/app.js — 2,571 lines)
├── Three.js Scene
│   ├── createBackgroundStars() — HYG catalog + fillers
│   ├── createCelestialObjects() — Messier deep-sky sprites
│   ├── createNebula() — decorative nebula shader
│   ├── createMilkyWay() — galactic band particles
│   ├── createStars() — 365 journal stars with custom shader
│   ├── createCalendarRing() — month markers
│   ├── createPlanets() — planetary positions
│   ├── createNebulaFog() — Phase 14 fog/clearing
│   └── createRealConstellationLines() — real constellation wireframes
├── Event Handlers (mouse, keyboard, panels)
├── Audio System (Web Audio API)
└── Animation Loop (requestAnimationFrame)
```

---

## 6. Design Language Summary

| Aspect | Value |
|--------|-------|
| Background void | `#060610` (dark navy-black) |
| Panel glass | `rgba(12,12,28,0.88)` + `blur(20-30px)` |
| Primary text | `#e8e6e3` (warm white) |
| Secondary text | `#8a8aa0` (muted lavender) |
| Dim text | `#4a4a6a` (deep purple-gray) |
| Gold accent | `#c9b06b` / `#d4af37` (warm gold) |
| Blue accent | `#4a8eff` |
| Purple accent | `#8a5cf5` |
| Borders | `rgba(255,255,255,0.06)` (barely visible) |
| Gold glow | `rgba(201,176,107,0.3)` border, `0.08-0.2` box-shadow |
| Typography UI | Segoe UI / Roboto / system sans |
| Typography writing | Cascadia Code / JetBrains Mono / monospace |
| Animations | `cubic-bezier(0.4, 0, 0.2, 1)` for UI, `easeOutCubic` for 3D |
| Blending | AdditiveBlending for all star/glow/corona layers |
| Everything | Dark, astronomical, glassmorphism, warm gold accents, quiet elegance |

---

## 7. Current State (Frozen v14)

- **Commit**: `66780c5` on `github.com/RJLopezAI/constellation-journal`
- **Total app.js**: 2,571 lines
- **Total styles.css**: 963 lines
- **Features through Phase 14**: Prophecy, Search Horizon, Filaments, Nebula Fog, Home/Escape keys
- **Shielded State**: All DB operations use prepared statements, bounded domain validation, pre-backup
- **No external dependencies at runtime**: Three.js loaded from local `node_modules`, no CDN/API calls
