# Constellation Journal — Complete Visual & Technical Context for LLMs

> **Purpose of this document**: You are receiving this because the developer cannot send you screenshots or screen recordings. This document describes the application with enough visual and technical precision that you can reason about it, suggest improvements, and write code for it as if you were looking at it.

---

## 1. What It Is

Constellation Journal is a **desktop Electron app** (Node.js + Three.js) that reimagines a daily journal as a 3D star sphere. Every day of the year is a star (365 total) arranged on a sphere using Fibonacci distribution. When you write a journal entry, that day's star ignites — changing color, growing in size, and emitting a glowing corona. Over a full year, your sky fills with the light of your own words.

The app integrates **live astronomical data** from NASA APIs — real planet positions, Near-Earth Objects, ISS tracking, Sentry impact threats, and solar weather — rendering them alongside your journal stars in a unified celestial experience.

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
| Constellation lines | default | 50 | Glowing constellation line segments with AdditiveBlending |
| Deep-sky objects | default | 49.5 | 12 famous nebulae/galaxies/clusters as procedural glow sprites at real RA/Dec |
| Meteor shower radiants | default | 49.7 | Up to 10 shower radiant markers (visible ±30 days from peak) |
| Planets | 2 | varies | Photorealistic 3D sphere meshes with real NASA textures |
| Saturn rings | 3 | varies | Separate RingGeometry with banded gradient and Cassini Division |
| Moon phase shadow | 4 | varies | Canvas-drawn terminator overlay showing correct illumination |
| Planet halos | default | varies | Additive-blend glow envelopes around each planet |
| Near-Earth Objects | default | 52 | Up to 30 color-coded asteroid points (gold/orange/red by miss distance) |
| Sentry threats | default | 51 | Rocky asteroid sprites with stardust debris clouds |
| ISS | default | varies | Blinking sprite with orbital trail line (90 points) |
| Solar weather / Aurora | default | varies | Multi-band aurora curtains driven by DONKI CME/flare data |
| Coronas | default | 50 | Additive-blend sprite halos around recently-written stars |

### 2.3 Background Stars (HYG Catalog + Fillers)
- **Real stars**: Positioned using RA/Dec from the HYG stellar catalog, converted to 3D via `celestialToXYZ()`. Colors derived from B-V color index (blue-white Vega, yellow Sun, red Betelgeuse). Sizes scaled by apparent magnitude: Sirius = 8px, Vega = 5px, magnitude 4 = 1px.
- **Filler stars**: 4,000 random points at radius 95-160. Slightly blue-tinted white (`0.6-0.95` RGB). Sizes 0.4-1.0.
- **Shader effects**:
  - **Class-dependent scintillation**: Stars twinkle based on their stellar classification. Giant/supergiant stars (class >3.5) twinkle slowly and subtly (0.6 Hz, 15% amplitude). Dwarf stars (class 0.5-1.5) twinkle rapidly and erratically (2.5 Hz, 50% amplitude). Main-sequence stars fall between.
  - **Diffraction spikes**: Stars render 4-point cross diffraction patterns. Intensity and narrowness scale with stellar class — supergiants have tight, prominent spikes (0.35 intensity, 14.0 narrowness). Giants have a visible outer halo ring.
  - **Fragment shader**: Bright core (smoothstep 0→coreR), wider glow halo (0→glowR), outer bloom (0.2→0.5), and cross-shaped diffraction. Core and glow radii adapt per class — giants have tighter cores with wider glow halos. Written stars have bright white centers with colored halos.
  - **Warm core enhancement**: Giant/supergiant stars shift toward warm white `(1.0, 0.95, 0.85)` based on class.

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
  - Class-dependent twinkle (giants slower and steadier, dwarfs faster and erratic)
  - **Pulsar mode** (Phase 14 prophecy stars): Rapid sharp amber pulsing at 6 Hz with `pow(abs(sin), 4.0)` for sharp beats. Color mixed 50% with gold `(0.83, 0.69, 0.22)`.
  - **Hover pulse**: Hovered star animates at 4 Hz with 40% size boost.
  - **Search dim**: During search, non-matching stars dim to 15% (`searchMult = 0.15`).

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
- **Rendering**: `LineBasicMaterial` with `AdditiveBlending` and `depthWrite: false` — lines emit a soft, ethereal celestial glow rather than appearing as flat opaque strokes. Color derived from the constellation's first star color. Animated fade-in when first detected.
- **Legend**: A glassmorphism panel in the top-right corner lists constellation names (auto-generated: "The Serene Bridge", "The Burning Path", etc.) with colored dots.

### 2.10 Planets — Photorealistic 3D Spheres
Planets are rendered as `THREE.Mesh` objects with `SphereGeometry(0.28, 32, 32)` wrapped in real photographic equirectangular textures (2K resolution) loaded via `THREE.TextureLoader`. Each planet has two components:

1. **Textured sphere mesh** (renderOrder 2): `MeshBasicMaterial` with real NASA/Solar System Scope texture maps:
   - Earth: NASA Blue Marble (654KB)
   - Jupiter: Banded atmosphere with Great Red Spot (499KB)
   - Saturn: Golden cloud bands (200KB) + separate **`RingGeometry`** (renderOrder 3)
   - Mars: Reddish surface with dark features (751KB)
   - Moon: Mare and highland detail (1.0MB) + **phase shadow overlay** (renderOrder 4)
   - Sun: Active surface with granulation (822KB)
   - Venus: Thick cloud atmosphere (230KB)
   - Neptune: Subtle blue banding (242KB)
   - Mercury: Uses Moon texture as fallback
   - Pluto: Dedicated texture (dwarf planet status, still gets its spot)

2. **Glow halo sprite**: Additive-blend radial gradient sprite envelope around each sphere, with color matched to planet's visual characteristics.

- **Planet rotation**: Each planet rotates at its own astronomically-inspired rate per frame. Jupiter rotates fastest (0.035 rad·dt⁻¹, reflecting its 9.9-hour period). Venus rotates retrograde (-0.001). Earth at 0.015. Sun slowly at 0.003. This makes the spheres feel alive.
- **Saturn's Ring**: Separate `THREE.RingGeometry` (1.25x–2.2x sphere radius, 64 segments). Custom 512px canvas texture with opaque banded gradient: C ring (dim), B ring (bright), Cassini Division (dark gap), A ring, Encke gap. `DoubleSide` rendering with `opacity: 0.85`. Tilted `Math.PI * 0.42` toward camera for clear visibility.
- **Moon phase illumination**: A shadow overlay sprite using the Moon's real `illumination` percentage (from orbital mechanics data). Canvas-drawn using dual-ellipse masking: at `illumination > 50%` (gibbous), most of the disc is lit with a thin shadow crescent. At `illumination < 50%` (crescent), most of the disc is in shadow. Shadow opacity 0.85. Updates every data refresh.

- **Positioning**: Planets are positioned using real **Keplerian orbital elements** computed by `orbital-mechanics.js` (`raDec2Cartesian`). Their RA/Dec sky positions are astronomically correct for the current date. This means planets can appear near each other or near the Sun when that's their actual sky position (e.g., Neptune near solar conjunction in March 2026).
- **Distance-based depth separation**: To prevent planets with similar RA/Dec from clipping through each other, each planet's sphere radius is offset using log₁₀ of its distance in AU. Inner planets (0.5–2 AU) sit near `SPHERE_RADIUS`, while Neptune (30 AU) is offset ~5.2 units outward. The Sun gets +4, the Moon gets -2.
- **LOD scaling**: Planet sphere and halo sizes respond to camera distance via a linear interpolation (`t = (camDist - 15) / 65`). Close up, spheres are large and halos are small/faint. Far away, spheres shrink and halos bloom for visibility.

### 2.11 Near-Earth Objects (NEOs)
- Up to 30 NEOs rendered as `THREE.Points` with a 64px procedural asteroid texture (irregular rocky shape with dust haze).
- **Color-coded by miss distance**: >5 LD = gold, >1 LD = orange, >0.5 LD = orange-red, <0.5 LD = red. Potentially hazardous asteroids get boosted red shift.
- **Subtle pulse**: Opacity oscillates between 0.30–0.60 at 1.5 Hz.
- **Positioned by name hash**: Since NASA NeoWs doesn't provide RA/Dec, positions are deterministically distributed using a hash of the NEO name.
- **Tooltips on hover**: Show name, miss distance (lunar distances + km), velocity (km/s), estimated diameter range (m), hazard status ⚠, and close approach date.

### 2.12 Sentry Impact Threats
- Top 10 known impact threats from NASA's Sentry system, rendered as `THREE.Group` objects:
  - **Central asteroid sprite** (64px): Irregular rocky shape with micro-craters and sunlit highlight, radial glow. Color by Torino scale (0 = gold, 1-3 = green, 4-7 = orange, 8+ = red).
  - **Stardust debris cloud**: 8-14 scattered small particles in a `THREE.Points` cloud orbiting the asteroid. Tumbles slowly (`rotation.y += dt * 0.2`).
- **Pulse animation**: Asteroid sprite and dust cloud pulse independently at 1.5 Hz.
- **Tooltips on hover**: Show name/designation, Torino scale, Palermo scale, impact probability (scientific notation), and diameter.

### 2.13 Deep-Sky Objects (12 Famous DSOs)
Twelve iconic nebulae, galaxies, and star clusters positioned at their **real RA/Dec coordinates** on the celestial sphere:

| Catalog | Name | Type | Color | Size |
|---------|------|------|-------|------|
| M42 | Orion Nebula | nebula | magenta-pink | 3.5 |
| M31 | Andromeda Galaxy | galaxy | warm amber | 4.0 |
| M45 | Pleiades | cluster | blue-white | 3.0 |
| M1 | Crab Nebula | nebula | orange | 2.0 |
| M57 | Ring Nebula | nebula | teal-green | 1.8 |
| M104 | Sombrero Galaxy | galaxy | golden | 2.2 |
| NGC5139 | Omega Centauri | cluster | pale gold | 3.0 |
| M16 | Eagle Nebula | nebula | rust-brown | 2.5 |
| M8 | Lagoon Nebula | nebula | rose-red | 2.8 |
| B33 | Horsehead Nebula | nebula | deep red | 1.5 |
| M51 | Whirlpool Galaxy | galaxy | warm gray | 2.0 |
| M33 | Triangulum Galaxy | galaxy | cool blue-gray | 2.5 |

- **Procedural textures by type**:
  - **Nebulae**: Diffuse radial gradient glow (center bright, fading to transparent).
  - **Galaxies**: Elliptical gradient (ctx.scale(1, 0.6) for oval shape), brighter nucleus.
  - **Clusters**: Radial base glow + 15 scattered micro-dots simulating individual stars.
- **Rendering**: AdditiveBlending, opacity 0.55, depthWrite false. Serve as subtle navigation landmarks.
- **Tooltips on hover**: Show 🌀/🌌/✨ type icon, catalog ID, visual magnitude, and description.

### 2.14 Meteor Shower Radiants
10 major annual meteor showers, each rendered as a teal-colored crosshair sprite at the shower's **real radiant RA/Dec position**:

| Shower | Peak | ZHR | Parent |
|--------|------|-----|--------|
| Quadrantids | Jan 4 | 120 | 2003 EH1 |
| Lyrids | Apr 22 | 18 | Thatcher |
| Eta Aquariids | May 6 | 50 | Halley |
| Delta Aquariids | Jul 30 | 25 | 96P/Machholz |
| Perseids | Aug 12 | 100 | Swift-Tuttle |
| Draconids | Oct 8 | 10 | 21P/Giacobini-Zinner |
| Orionids | Oct 21 | 20 | Halley |
| Leonids | Nov 17 | 15 | Tempel-Tuttle |
| Geminids | Dec 14 | 150 | 3200 Phaethon |
| Ursids | Dec 22 | 10 | 8P/Tuttle |

- **Visibility**: Only visible within ±30 days of peak date. Opacity fades proportionally to distance from peak (1.0 at peak, 0.15 at ±30 days).
- **Near-peak (<7 days)**: Sprite enlarged (4x vs 2.5x), tooltip shows "🔥 ACTIVE NOW".
- **Texture**: Radial teal glow + 4-pointed crosshair lines (simulating radiant convergence).
- **Tooltips on hover**: Show ☄ icon, shower name, peak date, ZHR (zenithal hourly rate), and parent comet/asteroid.

### 2.15 ISS Tracking
- The International Space Station rendered as a blinking sprite with a **90-point orbital trail** (light blue, additive blend, 25% opacity).
- **Blink animation**: Opacity oscillates 0.2–1.0 at 6 Hz (rapid blinking, like a satellite pass).
- **Position**: Real-time ISS coordinates from API data, converted to the celestial sphere.
- **Tooltips on hover**: Show 🛰 ISS, latitude/longitude, altitude (km), and velocity (km/s).

### 2.16 Solar Weather / Aurora (Phase 4B)
- Multi-band aurora curtains activated by real DONKI (NASA) solar weather data (CME, solar flare events).
- **Structure**: Multiple translucent band meshes at varying heights, each with independent phase and color.
- **Animation**: Per-band shimmer (0.7 + 0.3·sin(time·rate)), slow rotation (0.03 + i·0.02 rad/s), vertical oscillation (curtain effect).
- **Color**: Green-teal primary (`(0.1, 0.8, 0.3)`) with intensity scaled by solar event severity.

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
- Action buttons: "✎ Edit" (gold accent) and "✕ Delete" (red accent).
- Close button: "✦ Close" in a pill-shaped outlined button.

### 3.5 Star Tooltip (Hover)
- When hovering over any star (written or empty), a small glassmorphism tooltip appears near the cursor.
- Shows: Day number ("Day 75"), full date ("Sunday, March 16, 2026"), and status ("unwritten" or the emotion label).
- Star name in gold if written.

### 3.6 Planet Detail Panel
- Click any planet sphere → a glassmorphism popup appears with:
  - Planet name as header
  - Type label (e.g., "Gas Giant", "Terrestrial", "Dwarf Planet")
  - Stats grid: Diameter (km), Distance (AU), Orbital Period
  - Notable missions list (with launch years and descriptions)
  - Fun fact about the planet
  - Close button
- All 11 celestial bodies have full data: Mercury through Pluto, plus Moon and Sun.

### 3.7 Celestial Tooltips (Unified Hover System)
The `hitTest` raycaster checks, in order: planets → ISS → sentry threats → NEOs → deep-sky objects → meteor showers. Each type has a distinct tooltip format:

| Type | Name Format | Line 2 | Line 3 |
|------|-------------|--------|--------|
| Planet | Label | Distance (AU) | RA/Dec coordinates |
| ISS | 🛰 ISS | Lat/Lon | Altitude · Velocity |
| Sentry | ⚠ Name | Torino · Palermo | Impact prob · Diameter |
| NEO | ⚠Name (if hazardous) | Miss distance (LD · km) | Velocity · Diameter · Date |
| DSO | 🌀/🌌/✨ Name | Catalog · Magnitude · Type | Description |
| Meteor | ☄ Name (+ 🔥 ACTIVE) | Peak date · ZHR | Parent comet |

### 3.8 Search Panel (Phase 14)
- Opens from the top-center on `Ctrl+F` or 🔍 click. Glassmorphism panel, 460px wide.
- Text input with placeholder "Search your sky..."
- Live search: as you type, results appear below as clickable items showing day number + date + text preview.
- **Visual effects**: Matching stars brighten and grow; non-matching stars dim to 15%. Camera tweens to the centroid of matches. Gold filament lines (LineSegments, `#d4af37`, 35% opacity, additive blend) connect all matching stars.

### 3.9 Prophecy Panel (Phase 14)
- Click a **future** star (day after today) → centered glassmorphism panel appears at screen center.
- Header: "✦ Prophecy" in gold + date.
- Body: Textarea "Write a message to your future self..."
- Buttons: Cancel (ghosted) + "Seal Prophecy ✦" (gold).
- After sealing: star becomes a **pulsar** (rapid amber pulsing), panel shows 🔮 "Sealed until this day arrives."
- When the day arrives: main process auto-reveals at midnight, triggers a **48-particle supernova burst** (radial explosion, 3-second fade), then shows the revealed text.

### 3.10 Settings Panel
- Glassmorphism panel centered on screen. Contains:
  - Star brightness slider (range input with gold thumb)
  - Twinkle speed slider
  - Auto-rotate toggle (switch with gold/gray states)
  - Export/Import JSON buttons
  - Danger zone: "🗑 Clear All Data" button (red accent)

### 3.11 Calendar Footer
- Just above the Write button: "MARCH 17, 2026 · 3 / 365 STARS LIT · 1% sky cleared" in tiny dimmed uppercase letters (10px, `#4a4a6a`).

### 3.12 Onboarding
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
4. A **star tone** plays (self-contained audio IIFE module: sine oscillator → gain envelope, frequency mapped from star temperature).
5. If 3+ nearby entries form an emotional cluster → **constellation lines** animate in with AdditiveBlending glow and a **constellation chime** plays (random harmonics from C major).
6. Nebula fog clears around this star position.

### 4.3 Light Echo (Phase 10)
- Clicking an older written star triggers a **light echo**: 32 particles expanding outward from the star position in a ring, fading over 3 seconds. Like the visual of a supernova remnant expanding.

### 4.4 Longest Night (Phase 7)
- On December 21 (winter solstice), a special banner appears: "✦ The Longest Night ✦ / Your whole year illuminated" in gold, with enhanced ambient lighting as a celebration of completing most of the year.

### 4.5 Celestial Animations (per-frame in render loop)
- **Planet rotation**: Each planet sphere rotates around its Y axis at planet-specific rates. Jupiter fastest (0.035), Venus retrograde (-0.001). Makes the textured spheres visibly spinning.
- **Saturn ring tumble**: Ring gently shifts orientation with the planet group.
- **NEO pulse**: All NEO points oscillate opacity 0.30–0.60 at 1.5 Hz.
- **Sentry threat tumble**: Debris clouds rotate and asteroid sprites pulse independently.
- **ISS blink**: Rapid 6 Hz opacity oscillation (0.2–1.0), simulating satellite pass.
- **Aurora shimmer**: Each band has independent shimmer phase, slow rotation, and vertical oscillation.
- **LOD planet scaling**: Planet sphere and halo sizes smoothly interpolate based on camera distance.

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

Renderer Layer
├── app.js (~3,250 lines) — Three.js scene, UI, events, animation loop
│   ├── createBackgroundStars() — HYG catalog + fillers with custom ShaderMaterial
│   ├── createNebula() — decorative nebula FBM shader
│   ├── createMilkyWay() — galactic band particles
│   ├── createStars() — 365 journal stars with class-dependent shader
│   ├── createCalendarRing() — month markers
│   ├── createNebulaFog() — Phase 14 fog/clearing
│   ├── createRealConstellationLines() — real constellation wireframes
│   ├── drawConstellations() — emotional constellation lines (AdditiveBlending)
│   ├── showPlanetDetail() — planet click info panel with missions/facts
│   └── Tooltip system — unified hover for all celestial objects
│
├── celestial-renderer.js (~1,280 lines) — live astronomical data visualization
│   ├── createPlanetSprites() — 3D sphere meshes + TextureLoader + Saturn ring
│   ├── createNEOLayer() — batched asteroid points (hash-positioned)
│   ├── createISSLayer() — ISS sprite + orbital trail
│   ├── createSolarOverlay() — aurora curtain bands from DONKI data
│   ├── createDeepSkyObjects() — 12 DSOs as procedural glow sprites
│   ├── createMeteorShowers() — seasonal radiant markers (±30 day window)
│   ├── updatePlanets() — real RA/Dec positioning + moon phase shadow
│   ├── updateThreatHalos() — Sentry asteroid groups with debris clouds
│   ├── hitTest() — unified raycaster (planets→ISS→sentry→NEO→DSO→meteor)
│   └── update(dt) — per-frame animation: rotation, LOD, pulse, blink, aurora
│
├── celestial-tracker.js — NASA API data fetcher (NeoWs, ISS, Sentry, DONKI)
├── orbital-mechanics.js — Keplerian orbital elements → RA/Dec converter
├── audio-engine.js — self-contained IIFE audio module (star tones, chimes)
└── textures/ — real planet texture files (2K resolution, ~4.5MB total)
    ├── earth.jpg, jupiter.jpg, saturn.jpg, mars.jpg, venus.jpg
    ├── neptune.jpg, uranus.jpg, moon.jpg, sun.jpg, pluto.jpg
    └── saturn_ring.png
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
| Nebula accent colors | Magenta, teal-green, rust-brown, rose-red |
| DSO accent colors | Per-type: nebulae (warm), galaxies (amber), clusters (blue-white) |
| Meteor accent | Teal `rgb(120,220,200)` |
| Sentry colors | Torino-based: gold (0), green (1-3), orange (4-7), red (8+) |
| NEO colors | Miss-distance: gold (>5LD), orange (>1LD), red (<0.5LD) |
| Borders | `rgba(255,255,255,0.06)` (barely visible) |
| Gold glow | `rgba(201,176,107,0.3)` border, `0.08-0.2` box-shadow |
| Typography UI | Segoe UI / Roboto / system sans |
| Typography writing | Cascadia Code / JetBrains Mono / monospace |
| Animations | `cubic-bezier(0.4, 0, 0.2, 1)` for UI, `easeOutCubic` for 3D |
| 3D Blending | AdditiveBlending for all star/glow/corona/constellation/DSO/meteor layers |
| Constellation lines | AdditiveBlending with depthWrite:false for ethereal glow |
| Planet materials | MeshBasicMaterial with real image textures (no lighting needed) |
| Everything | Dark, astronomical, glassmorphism, warm gold accents, quiet elegance |

---

## 7. Current State (v2.0.0 — Frozen)

- **Commit**: Latest on `github.com/RJLopezAI/constellation-journal`
- **Codebase**: 30 source files, 12 texture assets
- **Total app.js**: ~3,250 lines
- **Total celestial-renderer.js**: ~1,270 lines
- **Total styles.css**: ~963 lines
- **Planet textures**: 11 files, ~4.5MB total (2K resolution real NASA/Solar System Scope)
- **Features through Phase 14+**: Prophecy, Search Horizon, Filaments, Nebula Fog, Home/Escape keys
- **Live astronomical data**: Real planet positions, NEOs, ISS, Sentry threats, solar weather (DONKI)
- **Deep sky objects**: 12 famous nebulae/galaxies/clusters at real RA/Dec
- **Meteor showers**: 12 annual showers (IMO catalog) with seasonal visibility + streak particle renderer
- **Planet rendering**: Photorealistic 3D spheres with real textures, rotation, Saturn rings, and moon phases
- **Render loop hardening**: All subsystem calls wrapped in `try/catch` guards to prevent single errors from crashing the animation loop
- **Audio engine**: Extracted to self-contained IIFE module (`audio-engine.js`)
- **Meaning objects**: Visual archetypes (nova/nebula/binary/dwarf/accretion/thread) around emotionally significant entries
- **Time engine**: Seek, playback, variable speed time control
- **Sky layer manager**: Unified layer orchestration + canonical `SkyObject` schema

### Audit Hardening (VERITAS Ω — v2.0.0)
- **Content Security Policy**: `<meta>` tag restricting `script-src`, `connect-src`, `style-src`, `img-src`
- **Domain validation**: `entry:save` IPC handler validates `dayOfYear ∈ [1,366]`, `year ∈ [2000,2100]`, `text.length ∈ [1,10000]`
- **Meteor data consolidated**: Single source of truth in `meteor-showers.js` (was duplicated inline in celestial-renderer)
- **Prepared statements only**: Zero string interpolation in any SQL query
- **Auto-backup**: `_backupDb()` before every write/delete/reveal
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`, typed IPC bridge
- **API resilience**: AbortController timeouts + graceful degradation on all NASA/ISS/WSPR endpoints
- **No external dependencies at runtime**: Three.js loaded from local `node_modules`, no CDN calls

