// Constellation Journal — Main App (Renderer)
// Orchestrates Three.js scene, star interactions, write panel, overlays, and audio.
// VERITAS Ω: All data flows through window.journal IPC bridge. Zero direct node access.

// THREE loaded via script tag in index.html (global)

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const STAR_COUNT = 365;
const SPHERE_RADIUS = 50;
const EMPTY_STAR_COLOR = new THREE.Color(0x6070a8);
const EMPTY_STAR_OPACITY = 0.55;
const EMPTY_STAR_SIZE = 3.5;
const WRITTEN_STAR_BASE_SIZE = 5.0;
const CORONA_DURATION_MS = Infinity; // coronas persist forever — they ARE the nebula

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let isContextLost = false; // High-assurance bounds
let scene, camera, renderer, raycaster, mouse;
let starPoints, starPositions, starData;
let constellationLines = [];
let coronaSprites = [];
let calendarRing;
let isWritePanelOpen = false;
let isOverlayOpen = false;
let hoveredStarIndex = -1;
let currentYear = new Date().getFullYear();
let entries = [];
let constellations = [];
let animationId;
let clock;
// Audio state managed by AudioEngine module
let nebulaUniforms;

// Orbit controls state
let isDragging = false;
let previousMousePos = { x: 0, y: 0 };
let spherical = { theta: 0, phi: Math.PI / 2, radius: 85 };
let targetSpherical = null; // for fly-to animation
let flyToProgress = 0;
let flyToDuration = 1.5; // seconds
let flyToStart = null;
let currentOverlayEntry = null; // for edit/delete

// ═══════════════════════════════════════════════════════════
// CAMERA ORBIT + FLY-TO
// ═══════════════════════════════════════════════════════════
function updateCameraFromSpherical() {
  camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  camera.position.y = spherical.radius * Math.cos(spherical.phi);
  camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  camera.lookAt(0, 0, 0);
}

function flyToStar(starPosition) {
  // Calculate target spherical coords facing the star
  const dir = starPosition.clone().normalize();
  const targetTheta = Math.atan2(dir.x, dir.z);
  const targetPhi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
  const targetRadius = Math.max(25, spherical.radius - 15); // zoom in toward star

  targetSpherical = { theta: targetTheta, phi: targetPhi, radius: targetRadius };
  flyToStart = { theta: spherical.theta, phi: spherical.phi, radius: spherical.radius };
  flyToProgress = 0;
}

function updateFlyTo(dt) {
  if (!targetSpherical) return;
  flyToProgress = Math.min(1, flyToProgress + dt / flyToDuration);
  const t = 1 - Math.pow(1 - flyToProgress, 3); // easeOutCubic

  spherical.theta = flyToStart.theta + (targetSpherical.theta - flyToStart.theta) * t;
  spherical.phi = flyToStart.phi + (targetSpherical.phi - flyToStart.phi) * t;
  spherical.radius = flyToStart.radius + (targetSpherical.radius - flyToStart.radius) * t;
  updateCameraFromSpherical();

  if (flyToProgress >= 1) {
    targetSpherical = null;
  }
}

// ═══════════════════════════════════════════════════════════
// FIBONACCI SPHERE DISTRIBUTION
// ═══════════════════════════════════════════════════════════
function fibonacciSphere(count, radius) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // -1 to 1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
  }
  return points;
}

// ═══════════════════════════════════════════════════════════
// DAY-OF-YEAR UTILITIES
// ═══════════════════════════════════════════════════════════
function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function formatDate(dayOfYear, year) {
  const d = new Date(year, 0, dayOfYear);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════
async function init() {
  clock = new THREE.Clock();

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);  // true black void
  // fog removed — washes out bloom post-processing

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 85);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);  // uncapped for RTX
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // ── Bloom Post-Processing (from bloom-setup.js module) ──
  // Module loads async; we poll for it with a short delay.
  // If not available yet, we set up a retry in animate().
  if (window.createBloomComposer) {
    window._bloomComposer = window.createBloomComposer(renderer, scene, camera);
  }

  // ── High Assurance: WebGL Context Loss Recovery ──
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    isContextLost = true;
    console.warn("WEBGL CONTEXT LOST: Pausing render loop to prevent crash.");
  }, false);

  renderer.domElement.addEventListener('webglcontextrestored', async () => {
    isContextLost = false;
    console.info("WEBGL CONTEXT RESTORED: Rebuilding GPU buffers...");
    await loadData();
    if (window._bgStars) createBackgroundStars();
    createMilkyWay();
  }, false);

  // Raycaster
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 1.5;
  mouse = new THREE.Vector2(-999, -999);

  // Create scene elements
  createBackgroundStars();
  createCelestialObjects();
  // createNebula() — DISABLED: bloom amplifies the BackSide sphere into purple wash
  // CSS vignette provides edge darkening instead
  createMilkyWay();
  createStars();
  createCalendarRing();
  createRealConstellationLines();

  // ── Sky Layer Manager: init before any layers ──
  if (window.SkyLayerManager) {
    window.SkyLayerManager.init(scene, camera);
  }

  // ── Celestial Tracker: replaces old createPlanets() ──
  if (window.CelestialRenderer && window.CelestialTracker) {
    window.CelestialRenderer.init(scene, camera);

    // Register celestial layers with sky layer manager
    if (window.SkyLayerManager) {
      window.SkyLayerManager.registerLayer({
        id: 'celestial-tracker',
        name: 'Celestial Tracker',
        class: 'celestial',
        visible: true,
        group: window.CelestialRenderer._getGroup ? window.CelestialRenderer._getGroup() : new THREE.Group(),
        update: (dt) => window.CelestialRenderer.update(dt),
        hitTest: (rc) => window.CelestialRenderer.hitTest(rc)
      });
    }

    window.CelestialTracker.init().then(() => {
      window.CelestialRenderer.updateAll(window.CelestialTracker);
    });
    // Refresh renderer every 30s
    setInterval(() => {
      if (window.CelestialTracker.isEnabled()) {
        window.CelestialRenderer.updateAll(window.CelestialTracker);
      }
    }, 30000);
  } else {
    createPlanets(); // fallback to old system
  }

  // ── Meteor Showers: Phase 4A ──
  if (window.MeteorRenderer && window.MeteorShowers) {
    window.MeteorRenderer.init(scene, camera);
    // Refresh shower activity every hour
    setInterval(() => window.MeteorRenderer.refreshShowers(), 3600000);
  }

  // ── Meaning Objects: Visual archetypes for journal stars ──
  if (window.MeaningObjects) {
    window.MeaningObjects.init(scene);
  }

  // Load data
  await loadData();

  // Phase 14: Create nebula fog (after data is loaded so clear mask is accurate)
  // createNebulaFog() — DISABLED: replaced by emergent nebula from persistent coronas
  // Each star's glow sprite IS the nebula. Clusters blend = clouds.

  // Phase 14: Listen for midnight prophecy reveals from main process
  window.journal.onProphecyRevealed(onProphecyRevealed);

  // Events
  setupEvents();

  // Update UI
  updateCalendarInfo();
  checkLongestNight();

  // Dismiss loading splash
  const splash = document.getElementById('loading-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 1000);
  }

  // Start render loop
  animate();
}

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// COORDINATE CONVERSION — RA/Dec to 3D Cartesian
// ═══════════════════════════════════════════════════════════
// Convention: Looking from inside the sphere (observer at center),
// RA increases leftward (east), Dec+ is north pole (up).
// This gives correct Northern Hemisphere perspective.
function celestialToXYZ(raHours, decDeg, radius) {
  const ra = (raHours / 24) * Math.PI * 2;
  const dec = (decDeg / 180) * Math.PI;
  // Negate x for correct east orientation from inside sphere
  const x = -radius * Math.cos(dec) * Math.cos(ra);
  const y = radius * Math.sin(dec);
  const z = radius * Math.cos(dec) * Math.sin(ra);
  return new THREE.Vector3(x, y, z);
}

// B-V color index → RGB (Planck blackbody approximation)
function bvToColor(bv) {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (bv < -0.2) r = 0.60 + 0.40 * (bv + 0.4) / 0.2;
  else if (bv < 0.0) r = 0.83 + 0.17 * (bv + 0.2) / 0.2;
  else r = 1.0;
  if (bv < 0.0) g = 0.70 + 0.30 * (bv + 0.4) / 0.4;
  else if (bv < 0.4) g = 1.0;
  else if (bv < 1.5) g = 1.0 - 0.50 * (bv - 0.4) / 1.1;
  else g = 0.50 - 0.20 * (bv - 1.5) / 0.5;
  if (bv < -0.2) b = 1.0;
  else if (bv < 0.4) b = 1.0 - 0.60 * (bv + 0.2) / 0.6;
  else if (bv < 1.0) b = 0.40 - 0.35 * (bv - 0.4) / 0.6;
  else b = 0.05;
  return new THREE.Color(
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b))
  );
}

// ═══════════════════════════════════════════════════════════
// REAL STAR FIELD — positions from HYG catalog
// ═══════════════════════════════════════════════════════════
function createBackgroundStars() {
  const catalog = typeof STAR_CATALOG_CLEAN !== 'undefined' ? STAR_CATALOG_CLEAN : (typeof STAR_CATALOG !== 'undefined' ? STAR_CATALOG : []);
  const count = catalog.length;
  const fillerCount = 4000;
  const totalCount = count + fillerCount;

  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const sizes = new Float32Array(totalCount);

  for (let i = 0; i < count; i++) {
    const star = catalog[i];
    const pos = celestialToXYZ(star.ra, star.dec, 90);
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    const col = bvToColor(star.bv);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    // Magnitude-based sizing: brighter = larger. Sirius → 8px, Vega → 5px, mag 4 → 1.0px
    const magNorm = (star.mag + 1.5) / 5.5;
    sizes[i] = Math.max(1.0, 8.0 * Math.pow(1 - Math.min(1, magNorm), 1.5));
  }

  for (let i = 0; i < fillerCount; i++) {
    const idx = count + i;
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 95 + Math.random() * 65;
    positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.cos(phi);
    const v = 0.6 + Math.random() * 0.35;
    colors[idx * 3] = v;
    colors[idx * 3 + 1] = v;
    colors[idx * 3 + 2] = v + Math.random() * 0.08;
    sizes[idx] = 0.4 + Math.random() * 0.6;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));

  // ShaderMaterial with per-vertex magnitude-driven sizing + twinkle
  const bgStarMat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: window.devicePixelRatio },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float starSize;
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vSize;
      uniform float uPixelRatio;
      uniform float uTime;
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      void main() {
        vColor = color;
        vSize = starSize;
        // Each star twinkles with more pronounced variation
        float phase = hash(position) * 6.2832;
        float rate = 0.3 + hash(position.zxy) * 0.8;
        float rate2 = 0.1 + hash(position.yzx) * 0.3;
        vTwinkle = 0.55 + 0.45 * sin(uTime * rate + phase) * (0.8 + 0.2 * sin(uTime * rate2 + phase * 1.7));
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = starSize * uPixelRatio * (400.0 / -mvPos.z) * vTwinkle;
        gl_PointSize = max(gl_PointSize, 1.5);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vSize;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        // Bright core with wider glow halo
        float core = smoothstep(0.45, 0.0, dist);
        float glow = smoothstep(0.5, 0.1, dist) * 0.6;
        // Diffraction spikes for brighter stars
        float spike = 0.0;
        if (vSize > 3.0) {
          vec2 pc = gl_PointCoord - vec2(0.5);
          float h = max(0.0, 1.0 - abs(pc.x) * 12.0) * max(0.0, 1.0 - abs(pc.y) * 3.0);
          float v = max(0.0, 1.0 - abs(pc.y) * 12.0) * max(0.0, 1.0 - abs(pc.x) * 3.0);
          spike = (h + v) * 0.35 * min(1.0, (vSize - 3.0) / 3.0);
        }
        float alpha = (core * 0.95 + glow + spike) * vTwinkle;
        gl_FragColor = vec4(vColor * (core + 0.5) + vec3(spike * 0.3), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const bgStars = new THREE.Points(geo, bgStarMat);
  bgStars.renderOrder = -3;
  bgStars.userData.material = bgStarMat; // store ref for animate()
  scene.add(bgStars);
  // Store globally so animate can update uTime and rotation
  window._bgStars = bgStars;
}

// ═══════════════════════════════════════════════════════════
// MESSIER DEEP-SKY OBJECTS — real positions from catalog
// ═══════════════════════════════════════════════════════════

function createSoftTexture(size, r, g, b, type) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;

  if (type === 'nebula') {
    for (let i = 0; i < 18; i++) {
      const ox = cx + (Math.random() - 0.5) * size * 0.6;
      const oy = cy + (Math.random() - 0.5) * size * 0.5;
      const rx = size * (0.08 + Math.random() * 0.2);
      const ry = size * (0.05 + Math.random() * 0.15);
      const a = 0.015 + Math.random() * 0.025;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, rx);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${a * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'galaxy') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.random() * Math.PI);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, cx * 0.5);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(0.2, `rgba(${r},${g},${b},0.05)`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},0.01)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.scale(1, 0.3 + Math.random() * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, cx * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'glow') {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.7);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.06)`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},0.02)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'ring') {
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = size * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.02);
    coreGrad.addColorStop(0, `rgba(${r},${g},${b},0.1)`);
    coreGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

function createCelestialObjects() {
  if (typeof MESSIER_CATALOG === 'undefined') return;

  const typeColors = {
    nb: [140, 80, 100], sn: [100, 140, 180], gx: [190, 175, 150],
    oc: [160, 180, 220], gc: [220, 200, 150], pn: [80, 180, 160],
  };
  const typeStyle = {
    nb: 'nebula', sn: 'nebula', gx: 'galaxy',
    oc: 'glow', gc: 'glow', pn: 'ring',
  };

  for (const obj of MESSIER_CATALOG) {
    const col = typeColors[obj.type] || [180, 180, 180];
    const style = typeStyle[obj.type] || 'glow';
    const pos = celestialToXYZ(obj.ra, obj.dec, 85);
    const angularScale = Math.min(obj.size / 20, 4);
    const magScale = Math.max(0.3, (12 - obj.mag) / 8);
    const scale = Math.max(1, angularScale * magScale * 2);
    const texSize = style === 'nebula' ? 128 : 64;
    const tex = createSoftTexture(texSize, col[0], col[1], col[2], style);

    let opacity = 0.15 + Math.max(0, (8 - obj.mag) / 20);
    if (obj.mag < 5) opacity = Math.min(0.35, opacity * 1.2);

    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);

    if (style === 'galaxy') {
      sprite.scale.set(scale, scale * (0.3 + Math.random() * 0.2), 1);
    } else if (style === 'nebula') {
      sprite.scale.set(scale * 1.5, scale * (0.6 + Math.random() * 0.3), 1);
    } else {
      sprite.scale.set(scale, scale, 1);
    }

    sprite.renderOrder = -2;
    scene.add(sprite);
  }
}

// ═══════════════════════════════════════════════════════════
// REAL CONSTELLATION LINES — IAU stick figures
// ═══════════════════════════════════════════════════════════
let realConstellationGroup = null;
let showRealConstellations = false;

function createRealConstellationLines() {
  if (typeof CONSTELLATION_LINES === 'undefined') return;
  const catalog = typeof STAR_CATALOG_CLEAN !== 'undefined' ? STAR_CATALOG_CLEAN : (typeof STAR_CATALOG !== 'undefined' ? STAR_CATALOG : []);

  realConstellationGroup = new THREE.Group();
  realConstellationGroup.visible = false;

  const starLookup = {};
  for (const s of catalog) { starLookup[s.name] = s; }

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x334466, transparent: true, opacity: 0.15,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  for (const [constName, pairs] of Object.entries(CONSTELLATION_LINES)) {
    for (const [nameA, nameB] of pairs) {
      const starA = starLookup[nameA];
      const starB = starLookup[nameB];
      if (!starA || !starB) continue;
      const posA = celestialToXYZ(starA.ra, starA.dec, 89);
      const posB = celestialToXYZ(starB.ra, starB.dec, 89);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        posA.x, posA.y, posA.z, posB.x, posB.y, posB.z
      ], 3));
      realConstellationGroup.add(new THREE.Line(geo, lineMat));
    }
  }

  scene.add(realConstellationGroup);
}

function toggleRealConstellations() {
  if (!realConstellationGroup) return;
  showRealConstellations = !showRealConstellations;
  realConstellationGroup.visible = showRealConstellations;
  const btn = document.getElementById('btn-constellations-toggle');
  if (btn) btn.style.opacity = showRealConstellations ? '1' : '0.5';
}


// ═══════════════════════════════════════════════════════════
// NEBULA LAYER — DISABLED
// Replaced by Phase 14 nebula fog which GROWS from journal entries.
// The old BackSide sphere with purple fbm was amplified by bloom.
// ═══════════════════════════════════════════════════════════
function createNebula() { /* no-op: replaced by growing fog system */ }

// ═══════════════════════════════════════════════════════════
// MILKY WAY BAND
// ═══════════════════════════════════════════════════════════
function createMilkyWay() {
  const count = 6000;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Distribute along a tilted great circle
    const t = (i / count) * Math.PI * 2;
    const spread = (Math.random() - 0.5) * 20;
    const spreadY = (Math.random() - 0.5) * 12;

    const radius = 93 + Math.random() * 12;
    const x = Math.cos(t) * radius + spread;
    const y = Math.sin(t) * radius * 0.3 + spreadY;
    const z = Math.sin(t) * radius * 0.8 + spread * 0.5;

    const angle = Math.PI / 3;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y * Math.cos(angle) - z * Math.sin(angle);
    positions[i * 3 + 2] = y * Math.sin(angle) + z * Math.cos(angle);

    sizes[i] = 0.4 + Math.random() * 1.0;
    opacities[i] = 0.04 + Math.random() * 0.12;

    // Color variation: blue-white core with purple/amber edges
    const core = Math.abs(spread) < 6 ? 1.0 : 0.0;
    const r = 0.55 + Math.random() * 0.25 + core * 0.2;
    const g = 0.50 + Math.random() * 0.20 + core * 0.25;
    const b = 0.65 + Math.random() * 0.30 + core * 0.15;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const circleTex = new THREE.CanvasTexture(cv);

  const mat = new THREE.PointsMaterial({
    size: 0.9,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
    depthWrite: false,
    map: circleTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const milkyWay = new THREE.Points(geo, mat);
  milkyWay.renderOrder = -1;
  milkyWay.rotation.set(-62.87 * Math.PI / 180, 0, 122.93 * Math.PI / 180);
  scene.add(milkyWay);
}

// ═══════════════════════════════════════════════════════════
// STARS (365 FIBONACCI-DISTRIBUTED)
// ═══════════════════════════════════════════════════════════
function createStars() {
  starPositions = fibonacciSphere(STAR_COUNT, SPHERE_RADIUS);
  starData = new Array(STAR_COUNT).fill(null);

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);
  const isPulsar = new Float32Array(STAR_COUNT); // Phase 14: Prophecy pulsar flag
  const starClassArr = new Float32Array(STAR_COUNT); // Phase 3A: Stellar classification

  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = starPositions[i].x;
    positions[i * 3 + 1] = starPositions[i].y;
    positions[i * 3 + 2] = starPositions[i].z;

    colors[i * 3] = EMPTY_STAR_COLOR.r;
    colors[i * 3 + 1] = EMPTY_STAR_COLOR.g;
    colors[i * 3 + 2] = EMPTY_STAR_COLOR.b;

    sizes[i] = EMPTY_STAR_SIZE;
    phases[i] = Math.random() * Math.PI * 2;
    isPulsar[i] = 0.0;
    starClassArr[i] = 0.0; // 0 = empty/unwritten
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('isPulsar', new THREE.BufferAttribute(isPulsar, 1));
  geometry.setAttribute('starClass', new THREE.BufferAttribute(starClassArr, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uHoveredIndex: { value: -1 },
      uSearchDim: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute float phase;
      attribute float isPulsar;
      attribute float starClass;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uHoveredIndex;
      uniform float uSearchDim;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vStarClass;

      void main() {
        vColor = color;
        vStarClass = starClass;

        // Twinkling — varies by stellar class
        float twinkleSpeed = starClass > 3.5 ? 0.6 : 1.2;
        float twinkleAmp = starClass > 3.5 ? 0.15 : 0.3;
        float twinkle = (1.0 - twinkleAmp) + twinkleAmp * sin(uTime * twinkleSpeed + phase * 6.28);

        // Micro-flicker: secondary noise layer (±2%) — makes stars feel alive
        float flicker2 = 0.98 + 0.04 * sin(uTime * 3.7 + phase * 13.37 + float(gl_VertexID) * 0.73);
        twinkle *= flicker2;

        // Dwarf stars: faster, more erratic twinkle
        if (starClass > 0.5 && starClass < 1.5) {
          twinkle = 0.5 + 0.5 * sin(uTime * 2.5 + phase * 12.56);
        }

        // Pulsar animation (Phase 14)
        float pulseSize = size;
        if (isPulsar > 0.5) {
          float pulsarBeat = 0.5 + 0.5 * pow(abs(sin(uTime * 6.0 + phase)), 4.0);
          pulseSize = size * (0.6 + pulsarBeat * 1.4);
          twinkle = pulsarBeat;
          vColor = mix(color, vec3(0.83, 0.69, 0.22), 0.5);
        }

        // Giant/Supergiant: warm core enhancement
        if (starClass > 3.5) {
          vColor = mix(color, vec3(1.0, 0.95, 0.85), 0.1 * (starClass - 3.0));
        }

        // Hover pulse
        float idx = float(gl_VertexID);
        if (abs(idx - uHoveredIndex) < 0.5) {
          float pulse = 1.0 + 0.4 * sin(uTime * 4.0);
          pulseSize *= pulse;
          twinkle = 1.0;
        }

        // Search dim (Phase 14)
        float searchMult = 1.0;
        if (uSearchDim > 0.5 && size < 4.1 && isPulsar < 0.5) {
          searchMult = 0.15;
        }

        // Alpha by class: empty = dim, dwarf = subtle, main+ = full
        float classAlpha = starClass < 0.5 ? 0.55 : (starClass < 1.5 ? 0.7 : 1.0);
        if (isPulsar > 0.5) classAlpha = 1.0;
        vAlpha = twinkle * classAlpha * searchMult;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pulseSize * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vStarClass;

      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));

        // Core + glow — class-dependent radii
        float coreR = vStarClass > 3.5 ? 0.08 : 0.12; // tighter core for giants
        float glowR = vStarClass > 3.5 ? 0.55 : 0.45;  // wider glow for giants
        float core = 1.0 - smoothstep(0.0, coreR, dist);
        float glow = 1.0 - smoothstep(0.0, glowR, dist);
        float bloom = 1.0 - smoothstep(0.2, 0.5, dist);

        // Diffraction cross — stronger for bigger stars
        vec2 pc = gl_PointCoord - vec2(0.5);
        float crossIntensity = vStarClass > 4.5 ? 0.35 : (vStarClass > 3.5 ? 0.25 : 0.2);
        float crossNarrow = vStarClass > 3.5 ? 14.0 : 10.0;
        float cross = max(0.0, 1.0 - abs(pc.x) * crossNarrow) * max(0.0, 1.0 - abs(pc.y) * 4.0)
                    + max(0.0, 1.0 - abs(pc.y) * crossNarrow) * max(0.0, 1.0 - abs(pc.x) * 4.0);
        cross *= crossIntensity;

        // Giant/supergiant: add outer halo ring
        float halo = 0.0;
        if (vStarClass > 3.5) {
          halo = smoothstep(0.3, 0.35, dist) * (1.0 - smoothstep(0.35, 0.5, dist)) * 0.15;
        }

        vec3 color = vColor * (glow * 0.8 + core * 0.6) + vec3(1.0) * core * 0.4;
        color += vColor * cross * 0.5;
        color += vColor * halo;
        float alpha = vAlpha * (glow * 0.7 + core * 0.3 + bloom * 0.15 + cross * 0.1 + halo);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  starPoints = new THREE.Points(geometry, material);
  scene.add(starPoints);
}

// ═══════════════════════════════════════════════════════════
// CALENDAR RING
// ═══════════════════════════════════════════════════════════
function createCalendarRing() {
  const ringGroup = new THREE.Group();
  const ringRadius = SPHERE_RADIUS + 5;
  const todayDOY = getDayOfYear();

  // Tick marks
  for (let i = 1; i <= 365; i++) {
    const angle = ((i - 1) / 365) * Math.PI * 2 - Math.PI / 2;
    const tickLength = (i % 30 === 1) ? 1.5 : 0.5;
    const innerR = ringRadius;
    const outerR = ringRadius + tickLength;

    const points = [
      new THREE.Vector3(Math.cos(angle) * innerR, Math.sin(angle) * innerR, 0),
      new THREE.Vector3(Math.cos(angle) * outerR, Math.sin(angle) * outerR, 0),
    ];

    const isToday = i === todayDOY;
    const isMonthStart = (i % 30 === 1);
    const color = isToday ? 0xc9b06b : (isMonthStart ? 0x4a4a6a : 0x1a1a2e);
    const opacity = isToday ? 1.0 : (isMonthStart ? 0.5 : 0.2);

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    ringGroup.add(line);
  }

  // Month labels - using smaller points as markers
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthDays = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

  ringGroup.rotation.x = Math.PI / 6; // Tilt slightly for 3D feel
  calendarRing = ringGroup;
  scene.add(ringGroup);
}

// ═══════════════════════════════════════════════════════════
// CORONA EFFECT (NEW ENTRIES)
// ═══════════════════════════════════════════════════════════
function addCorona(starIndex, colorHex, daysOld) {
  const position = starPositions[starIndex];

  // Age-based color: recent = bright gold, old = faded amber
  let coronaColor;
  if (daysOld !== undefined && daysOld > 0) {
    const ageFactor = Math.min(daysOld / 365, 1.0); // 0=new, 1=year old
    const r = 1.0 - ageFactor * 0.22;    // 1.0 → 0.78
    const g = 0.82 - ageFactor * 0.30;   // 0.82 → 0.52
    const b = 0.50 - ageFactor * 0.20;   // 0.50 → 0.30
    coronaColor = new THREE.Color(r, g, b);
  } else {
    coronaColor = new THREE.Color(colorHex);
  }

  // Create soft circular glow texture for corona — larger, brighter
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const coronaTex = new THREE.CanvasTexture(cv);

  const spriteMat = new THREE.SpriteMaterial({
    map: coronaTex,
    color: coronaColor,
    transparent: true,
    opacity: daysOld > 0 ? 0.12 : 0.7, // old entries start at resting opacity
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(position);
  const baseScale = daysOld > 0 ? 12 + Math.min(daysOld / 30, 6) : 10; // older = slightly larger
  sprite.scale.set(baseScale, baseScale, 1);
  sprite.userData = { createdAt: Date.now(), starIndex, daysOld: daysOld || 0, baseScale };
  scene.add(sprite);
  coronaSprites.push(sprite);
}

function updateCoronas() {
  const now = Date.now();

  // ── Cluster gravity hint: compute centroid of nearby coronas ──
  for (let i = coronaSprites.length - 1; i >= 0; i--) {
    const sprite = coronaSprites[i];
    const elapsed = now - sprite.userData.createdAt;

    // Persistent coronas: fade from initial bright to resting glow
    const FADE_IN_MS = 30000;
    const MIN_OPACITY = 0.08;
    const INITIAL_OPACITY = sprite.userData.daysOld > 0 ? 0.12 : 0.7;

    if (elapsed < FADE_IN_MS && sprite.userData.daysOld === 0) {
      const t = elapsed / FADE_IN_MS;
      sprite.material.opacity = INITIAL_OPACITY + (MIN_OPACITY - INITIAL_OPACITY) * t;
      const breathe = 1.0 + 0.15 * Math.sin(elapsed * 0.003);
      sprite.scale.setScalar(sprite.userData.baseScale * breathe);
    } else {
      sprite.material.opacity = MIN_OPACITY + 0.02 * Math.sin(elapsed * 0.0005);
      const slowBreathe = 1.0 + 0.04 * Math.sin(elapsed * 0.0008);
      sprite.scale.setScalar(sprite.userData.baseScale * slowBreathe);

      // Gravity drift: inch toward nearest cluster centroid (very subtle)
      if (coronaSprites.length > 3) {
        let cx = 0, cy = 0, cz = 0, count = 0;
        for (let j = 0; j < coronaSprites.length; j++) {
          if (j === i) continue;
          const d = sprite.position.distanceTo(coronaSprites[j].position);
          if (d < 20 && d > 0.5) {
            cx += coronaSprites[j].position.x;
            cy += coronaSprites[j].position.y;
            cz += coronaSprites[j].position.z;
            count++;
          }
        }
        if (count >= 2) {
          cx /= count; cy /= count; cz /= count;
          // Extremely gentle drift — 0.0001 units per frame
          sprite.position.x += (cx - sprite.position.x) * 0.0001;
          sprite.position.y += (cy - sprite.position.y) * 0.0001;
          sprite.position.z += (cz - sprite.position.z) * 0.0001;
        }
      }
    }
  }

  // Update nova bursts
  updateNovaBursts();
}

// ═══════════════════════════════════════════════════════════
// PHASE 3C: NOVA BURST (MILESTONE/SUPERGIANT ENTRIES)
// ═══════════════════════════════════════════════════════════
let novaBursts = [];

function createNovaBurst(starIndex, colorHex) {
  const position = starPositions[starIndex];
  if (!position) return;

  const particleCount = 40;
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];
  const color = new THREE.Color(colorHex);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;

    // Random radial velocity
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 2 + Math.random() * 6;
    velocities.push({
      x: Math.sin(phi) * Math.cos(theta) * speed,
      y: Math.sin(phi) * Math.sin(theta) * speed,
      z: Math.cos(phi) * speed
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Nova texture: bright white core
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, `rgba(${Math.floor(color.r*255)},${Math.floor(color.g*255)},${Math.floor(color.b*255)},0.8)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const material = new THREE.PointsMaterial({
    size: 2.5,
    transparent: true,
    opacity: 1.0,
    map: new THREE.CanvasTexture(cv),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  novaBursts.push({
    points,
    velocities,
    age: 0,
    life: 3.0,
    origin: position.clone()
  });
}

function updateNovaBursts() {
  const dt = 0.016; // approximate 60fps
  for (let i = novaBursts.length - 1; i >= 0; i--) {
    const burst = novaBursts[i];
    burst.age += dt;

    if (burst.age >= burst.life) {
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.points.material.map.dispose();
      burst.points.material.dispose();
      novaBursts.splice(i, 1);
      continue;
    }

    const progress = burst.age / burst.life;
    const posArr = burst.points.geometry.attributes.position.array;

    for (let j = 0; j < burst.velocities.length; j++) {
      const v = burst.velocities[j];
      // Decelerate over time
      const decay = 1 - progress * 0.8;
      posArr[j * 3] += v.x * dt * decay;
      posArr[j * 3 + 1] += v.y * dt * decay;
      posArr[j * 3 + 2] += v.z * dt * decay;
    }

    burst.points.geometry.attributes.position.needsUpdate = true;

    // Fade out
    burst.points.material.opacity = Math.max(0, 1 - progress * progress);
    burst.points.material.size = 2.5 * (1 - progress * 0.5);
  }
}

// ═══════════════════════════════════════════════════════════
// LIGHT A STAR — IGNITION EFFECT
// When a journal entry is saved, the star doesn't just appear.
// It IGNITES. Flash → ramp → settle → breathe.
// ═══════════════════════════════════════════════════════════
let activeIgnitions = [];

function igniteStar(starIndex, targetColor, targetSize, starClassVal) {
  const position = starPositions[starIndex];
  if (!position) return;

  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;

  // ══ BIRTH MOMENT: World-freeze — time stops for 150ms ══
  window._birthMomentFreeze = performance.now();

  // ── Phase 0: Start the star white-hot and tiny (pre-ignition) ──
  colorsArr[starIndex * 3]     = 1.0;
  colorsArr[starIndex * 3 + 1] = 1.0;
  colorsArr[starIndex * 3 + 2] = 1.0;
  sizesArr[starIndex] = 1.5; // tiny seed
  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;

  // ── Nearby star disturbance: bump neighbors bigger ──
  const DISTURBANCE_RADIUS = 15;
  const nearbyStars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    if (i === starIndex || !starData[i]) continue; // only affect written stars
    const d = starPositions[i].distanceTo(position);
    if (d < DISTURBANCE_RADIUS) {
      const originalSize = sizesArr[i];
      const distFactor = 1 - (d / DISTURBANCE_RADIUS); // closer = stronger
      nearbyStars.push({ index: i, originalSize, distFactor });
      // Immediate bump: 30% larger, proportional to proximity
      sizesArr[i] = originalSize * (1 + 0.3 * distFactor);
    }
  }
  if (nearbyStars.length > 0) starPoints.geometry.attributes.size.needsUpdate = true;

  // ── Shockwave ring mesh ──
  const ringGeo = new THREE.RingGeometry(0.1, 0.6, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.copy(position);
  ringMesh.lookAt(camera.position);
  scene.add(ringMesh);

  // ── Flash sprite (white-hot core) ──
  const flashCv = document.createElement('canvas');
  flashCv.width = 128; flashCv.height = 128;
  const flashCtx = flashCv.getContext('2d');
  const flashGrad = flashCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  flashGrad.addColorStop(0, 'rgba(255,255,255,1)');
  flashGrad.addColorStop(0.1, 'rgba(255,250,230,0.9)');
  flashGrad.addColorStop(0.3, 'rgba(255,220,150,0.4)');
  flashGrad.addColorStop(0.6, 'rgba(255,180,80,0.1)');
  flashGrad.addColorStop(1, 'rgba(255,150,50,0)');
  flashCtx.fillStyle = flashGrad;
  flashCtx.fillRect(0, 0, 128, 128);
  const flashTex = new THREE.CanvasTexture(flashCv);

  const flashMat = new THREE.SpriteMaterial({
    map: flashTex,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flashSprite = new THREE.Sprite(flashMat);
  flashSprite.position.copy(position);
  flashSprite.scale.set(2, 2, 1);
  scene.add(flashSprite);

  // ── Register ignition for animation loop ──
  activeIgnitions.push({
    starIndex,
    targetColor: new THREE.Color(targetColor),
    targetSize,
    starClassVal,
    startTime: performance.now(),
    ringMesh,
    flashSprite,
    nearbyStars, // for disturbance settling
    phase: 'flash',
    duration: {
      flash: 300,
      ramp: 1500,
      settle: 500,
    },
  });
}

function updateIgnitions() {
  const now = performance.now();
  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;
  let needsColorUpdate = false;
  let needsSizeUpdate = false;

  for (let i = activeIgnitions.length - 1; i >= 0; i--) {
    const ig = activeIgnitions[i];
    const elapsed = now - ig.startTime;
    const totalDuration = ig.duration.flash + ig.duration.ramp + ig.duration.settle;

    if (elapsed >= totalDuration) {
      // ── Done: set final state and clean up ──
      colorsArr[ig.starIndex * 3]     = ig.targetColor.r;
      colorsArr[ig.starIndex * 3 + 1] = ig.targetColor.g;
      colorsArr[ig.starIndex * 3 + 2] = ig.targetColor.b;
      sizesArr[ig.starIndex] = ig.targetSize;
      needsColorUpdate = true;
      needsSizeUpdate = true;

      // Remove effects
      scene.remove(ig.ringMesh);
      ig.ringMesh.geometry.dispose();
      ig.ringMesh.material.dispose();
      scene.remove(ig.flashSprite);
      ig.flashSprite.material.map.dispose();
      ig.flashSprite.material.dispose();

      // Reset nearby stars to original sizes
      if (ig.nearbyStars) {
        for (const ns of ig.nearbyStars) {
          sizesArr[ns.index] = ns.originalSize;
        }
        needsSizeUpdate = true;
      }

      activeIgnitions.splice(i, 1);
      continue;
    }

    // ── FLASH phase (0 → 300ms) ──
    if (elapsed < ig.duration.flash) {
      const t = elapsed / ig.duration.flash;
      const easeOut = 1 - Math.pow(1 - t, 3);

      // Flash sprite: expand rapidly then start fading
      ig.flashSprite.scale.setScalar(2 + easeOut * 18);
      ig.flashSprite.material.opacity = 1.0 - easeOut * 0.5;

      // Shockwave ring: expand outward
      const ringScale = 1 + easeOut * 20;
      ig.ringMesh.scale.set(ringScale, ringScale, 1);
      ig.ringMesh.material.opacity = 0.8 * (1 - easeOut);
      ig.ringMesh.lookAt(camera.position);

      // Star stays white-hot, grows slightly
      sizesArr[ig.starIndex] = 1.5 + t * 4;
      needsSizeUpdate = true;
    }

    // ── RAMP phase (300ms → 1800ms) ──
    else if (elapsed < ig.duration.flash + ig.duration.ramp) {
      const rampTime = elapsed - ig.duration.flash;
      const t = rampTime / ig.duration.ramp;
      const easeOut = 1 - Math.pow(1 - t, 3); // easeOutCubic

      // Fade flash sprite away
      ig.flashSprite.material.opacity = Math.max(0, 0.5 * (1 - t));
      ig.flashSprite.scale.setScalar(20 + t * 5);

      // Ring is gone by now
      ig.ringMesh.material.opacity = 0;

      // Color ramps from white → target color
      colorsArr[ig.starIndex * 3]     = 1.0 + (ig.targetColor.r - 1.0) * easeOut;
      colorsArr[ig.starIndex * 3 + 1] = 1.0 + (ig.targetColor.g - 1.0) * easeOut;
      colorsArr[ig.starIndex * 3 + 2] = 1.0 + (ig.targetColor.b - 1.0) * easeOut;
      needsColorUpdate = true;

      // Size ramps from seed to target
      sizesArr[ig.starIndex] = 5.5 + (ig.targetSize - 5.5) * easeOut;
      needsSizeUpdate = true;

      // Nearby stars settle back to original sizes
      if (ig.nearbyStars) {
        for (const ns of ig.nearbyStars) {
          const bumped = ns.originalSize * (1 + 0.3 * ns.distFactor);
          sizesArr[ns.index] = bumped + (ns.originalSize - bumped) * easeOut;
        }
      }
    }

    // ── SETTLE phase (1800ms → 2300ms) ──
    else {
      const settleTime = elapsed - ig.duration.flash - ig.duration.ramp;
      const t = settleTime / ig.duration.settle;

      // Final color is set
      colorsArr[ig.starIndex * 3]     = ig.targetColor.r;
      colorsArr[ig.starIndex * 3 + 1] = ig.targetColor.g;
      colorsArr[ig.starIndex * 3 + 2] = ig.targetColor.b;
      needsColorUpdate = true;

      // Gentle pulse at final size (breathe in/out)
      const breathe = 1.0 + 0.15 * Math.sin(t * Math.PI * 2);
      sizesArr[ig.starIndex] = ig.targetSize * breathe;
      needsSizeUpdate = true;

      // Clean up effects if still visible
      ig.flashSprite.material.opacity = 0;
      ig.ringMesh.material.opacity = 0;
    }
  }

  if (needsColorUpdate) starPoints.geometry.attributes.color.needsUpdate = true;
  if (needsSizeUpdate) starPoints.geometry.attributes.size.needsUpdate = true;
}

// ═══════════════════════════════════════════════════════════
// PHASE 3B: EMOTION PALETTE ENRICHMENT (12 EMOTIONS)
// ═══════════════════════════════════════════════════════════
// Maps valence/arousal pair to a richer spectral color.
// Applied as a subtle tint on top of the DB-provided color.
const EMOTION_PALETTE = {
  // High valence, high arousal
  joy:           '#FFD700',   // warm gold
  surprise:      '#33CCCC',   // bright cyan

  // High valence, low arousal
  calm:          '#6699CC',   // cool blue
  gratitude:     '#FFEECC',   // warm white
  hope:          '#66CC99',   // spring green

  // Low valence, high arousal
  anger:         '#CC3333',   // deep red
  anxiety:       '#CC8844',   // pale orange
  fear:          '#663399',   // deep violet

  // Low valence, low arousal
  sadness:       '#4444AA',   // indigo
  nostalgia:     '#CC9933',   // amber

  // Neutral
  love:          '#FF6699',   // soft rose
  determination: '#4488AA',   // steel blue
};

function enrichStarColor(baseColorHex, valence, arousal) {
  if (typeof valence !== 'number' || typeof arousal !== 'number') return baseColorHex;

  // Map valence/arousal to closest emotion
  let emotion;
  if (valence > 0.3 && arousal > 0.5) emotion = 'joy';
  else if (valence > 0.3 && arousal > 0.2) emotion = 'hope';
  else if (valence > 0.3 && arousal < 0.2) emotion = 'calm';
  else if (valence > 0 && arousal > 0.7) emotion = 'surprise';
  else if (valence > 0 && arousal < 0.3) emotion = 'gratitude';
  else if (valence < -0.3 && arousal > 0.5) emotion = 'anger';
  else if (valence < -0.3 && arousal > 0.2) emotion = 'anxiety';
  else if (valence < -0.3 && arousal < 0.2) emotion = 'sadness';
  else if (valence < 0 && arousal > 0.5) emotion = 'fear';
  else if (valence < 0 && arousal < 0.3) emotion = 'nostalgia';
  else emotion = 'determination';

  const emotionColor = EMOTION_PALETTE[emotion];
  if (!emotionColor) return baseColorHex;

  // Subtle tint: blend 20% of emotion color into base
  const base = new THREE.Color(baseColorHex);
  const tint = new THREE.Color(emotionColor);
  base.lerp(tint, 0.2);
  return '#' + base.getHexString();
}

// ═══════════════════════════════════════════════════════════
// PHASE 10: LIGHT ECHO — expanding ring on old entry recall
// ═══════════════════════════════════════════════════════════
let lightEchoGroup = null;
let lightEchoStart = 0;
const LIGHT_ECHO_DURATION = 3000; // 3 seconds

function triggerLightEcho(starIndex, colorHex) {
  // Clean up previous echo
  if (lightEchoGroup) {
    scene.remove(lightEchoGroup);
  }

  const center = starPositions[starIndex];
  lightEchoGroup = new THREE.Group();
  lightEchoGroup.userData.center = center.clone();
  lightEchoStart = Date.now();

  const particleCount = 32;
  const positions = new Float32Array(particleCount * 3);
  const angles = new Float32Array(particleCount);

  // Create a ring of particles around the star
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    angles[i] = angle;
    positions[i * 3] = center.x;
    positions[i * 3 + 1] = center.y;
    positions[i * 3 + 2] = center.z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(colorHex),
    size: 0.8,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  lightEchoGroup.add(points);
  lightEchoGroup.userData.angles = angles;
  lightEchoGroup.userData.geo = geo;
  lightEchoGroup.userData.mat = mat;
  scene.add(lightEchoGroup);
}

function updateLightEcho() {
  if (!lightEchoGroup) return;
  const elapsed = Date.now() - lightEchoStart;

  if (elapsed > LIGHT_ECHO_DURATION) {
    scene.remove(lightEchoGroup);
    lightEchoGroup = null;
    return;
  }

  const t = elapsed / LIGHT_ECHO_DURATION;
  const radius = 2 + t * 10; // expand from 2 to 12
  const opacity = 0.6 * (1 - t * t); // easeOutQuad fade
  const center = lightEchoGroup.userData.center;
  const angles = lightEchoGroup.userData.angles;
  const posArr = lightEchoGroup.userData.geo.attributes.position.array;

  calculateEchoRing(center, radius, angles, posArr);

  lightEchoGroup.userData.geo.attributes.position.needsUpdate = true;
  lightEchoGroup.userData.mat.opacity = opacity;
}

function calculateEchoRing(center, radius, angles, posArr) {
  // Camera-facing ring: get camera normal
  const normal = camera.position.clone().sub(center).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const ringUp = new THREE.Vector3().crossVectors(normal, right).normalize();

  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const dx = Math.cos(a) * radius;
    const dy = Math.sin(a) * radius;
    posArr[i * 3] = center.x + right.x * dx + ringUp.x * dy;
    posArr[i * 3 + 1] = center.y + right.y * dx + ringUp.y * dy;
    posArr[i * 3 + 2] = center.z + right.z * dx + ringUp.z * dy;
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 11: SEMANTIC FILAMENTS (OLLAMA EMBEDDINGS)
// ═══════════════════════════════════════════════════════════
let semanticFilamentsGroup = null;

function computeFilaments(entries) {
  if (semanticFilamentsGroup) {
    scene.remove(semanticFilamentsGroup);
    semanticFilamentsGroup = null;
  }

  const mat = new THREE.LineBasicMaterial({
    color: 0xbbddff, // icy blue glow
    transparent: true, opacity: 0.25,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const positions = [];
  
  function cosineSimilarity(A, B, normA, normB) {
    if (A.length !== B.length) return 0;
    let dot = 0;
    for (let i = 0; i < A.length; i++) {
      dot += A[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  // Pre-calculate norms to save O(N^2) calculations
  const norms = new Array(entries.length).fill(0);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].embedding) {
      let norm = 0;
      for (let k = 0; k < entries[i].embedding.length; k++) {
        norm += entries[i].embedding[k] * entries[i].embedding[k];
      }
      norms[i] = Math.sqrt(norm);
    }
  }

  // Pairwise comparison
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const e1 = entries[i];
      const e2 = entries[j];
      if (e1.embedding && e2.embedding) {
        const sim = cosineSimilarity(e1.embedding, e2.embedding, norms[i], norms[j]);
        if (sim > 0.70) { // Similarity threshold
          const idx1 = e1.day_of_year - 1;
          const idx2 = e2.day_of_year - 1;
          const p1 = starPositions[idx1];
          const p2 = starPositions[idx2];
          positions.push(p1.x, p1.y, p1.z);
          positions.push(p2.x, p2.y, p2.z);
        }
      }
    }
  }

  if (positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    semanticFilamentsGroup = new THREE.LineSegments(geo, mat);
    semanticFilamentsGroup.renderOrder = 0;
    scene.add(semanticFilamentsGroup);
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 8: GRAVITATIONAL WELL — crisis entries warp the sky
// ═══════════════════════════════════════════════════════════
let gravityWells = [];

function createGravityWell(starIndex, intensity) {
  const pos = starPositions[starIndex];
  const wellSize = 8 + intensity * 6; // bigger well for more intense emotions

  // Animated vortex texture
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const cx = 64, cy = 64;

  // Dark core with spiral arms
  for (let ring = 0; ring < 5; ring++) {
    const r = 10 + ring * 10;
    const grad = ctx.createRadialGradient(cx, cy, r - 5, cx, cy, r + 5);
    grad.addColorStop(0, `rgba(20, 0, 40, ${0.15 - ring * 0.02})`);
    grad.addColorStop(1, 'rgba(20, 0, 40, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Deep core
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
  coreGrad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  coreGrad.addColorStop(0.5, 'rgba(40, 0, 60, 0.2)');
  coreGrad.addColorStop(1, 'rgba(40, 0, 60, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);

  const wellMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.4 + intensity * 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(0x3a0066),
  });

  const sprite = new THREE.Sprite(wellMat);
  sprite.position.copy(pos);
  sprite.scale.set(wellSize, wellSize, 1);
  sprite.renderOrder = 1;
  sprite.userData = { starIndex, intensity, baseSize: wellSize };
  scene.add(sprite);
  gravityWells.push(sprite);
}

function updateGravityWells(time) {
  for (const well of gravityWells) {
    // Slow pulsing breathing
    const pulse = 1.0 + 0.08 * Math.sin(time * 0.8 + well.userData.starIndex);
    const s = well.userData.baseSize * pulse;
    well.scale.set(s, s, 1);
    // Slow rotation to simulate vortex
    well.material.rotation += 0.003 * well.userData.intensity;
  }
}

function clearGravityWells() {
  for (const w of gravityWells) scene.remove(w);
  gravityWells = [];
}

// ═══════════════════════════════════════════════════════════
// PHASE 7: PLANETS — real positions from Keplerian elements
// ═══════════════════════════════════════════════════════════
const PLANETS = [
  { name: 'Mercury', a: 0.387, e: 0.206, I: 7.0, L0: 252.25, n: 4.092, color: 0xb5a88a, size: 0.8 },
  { name: 'Venus',   a: 0.723, e: 0.007, I: 3.4, L0: 181.98, n: 1.602, color: 0xf5deb3, size: 1.2 },
  { name: 'Mars',    a: 1.524, e: 0.093, I: 1.9, L0: 355.45, n: 0.524, color: 0xdd4422, size: 1.0 },
  { name: 'Jupiter', a: 5.203, e: 0.048, I: 1.3, L0: 34.40,  n: 0.083, color: 0xd4a574, size: 2.0 },
  { name: 'Saturn',  a: 9.537, e: 0.054, I: 2.5, L0: 49.94,  n: 0.034, color: 0xf0d890, size: 1.8 },
  { name: 'Uranus',  a: 19.19, e: 0.047, I: 0.8, L0: 313.23, n: 0.012, color: 0x88ccdd, size: 1.4 },
  { name: 'Neptune', a: 30.07, e: 0.009, I: 1.8, L0: 304.88, n: 0.006, color: 0x4466ee, size: 1.4 },
];

let planetSprites = [];

function createPlanets() {
  const now = new Date();
  const J2000 = new Date(2000, 0, 1, 12, 0, 0);
  const daysSinceJ2000 = (now - J2000) / (1000 * 60 * 60 * 24);

  for (const p of PLANETS) {
    // Mean anomaly
    const M = ((p.L0 + p.n * daysSinceJ2000) % 360) * Math.PI / 180;
    // Eccentric anomaly (simple approximation)
    let E = M;
    for (let i = 0; i < 5; i++) {
      E = M + p.e * Math.sin(E);
    }
    // True anomaly
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + p.e) * Math.sin(E / 2),
      Math.sqrt(1 - p.e) * Math.cos(E / 2)
    );
    // Distance from sun
    const r = p.a * (1 - p.e * Math.cos(E));

    // Convert to ecliptic XY (simplified — ignore longitude of ascending node)
    const xEcl = r * Math.cos(nu);
    const yEcl = r * Math.sin(nu);

    // Map to our sky sphere — place planets on large sphere
    // Scale: 1 AU ≈ 10 degrees on sky, place at radius 140
    const skyRadius = 140;
    const scaledAngle = nu + daysSinceJ2000 * p.n * Math.PI / 180;
    const inclRad = p.I * Math.PI / 180;

    const x = skyRadius * Math.cos(scaledAngle) * Math.cos(inclRad);
    const y = skyRadius * Math.sin(inclRad) * Math.sign(Math.sin(scaledAngle));
    const z = skyRadius * Math.sin(scaledAngle) * Math.cos(inclRad);

    // Create planet glow texture
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);

    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(p.color),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(p.size * 2, p.size * 2, 1);
    sprite.userData = { planetName: p.name, planetData: p };
    scene.add(sprite);
    planetSprites.push(sprite);
  }
}

// ═══════════════════════════════════════════════════════════
// CONSTELLATION LINES
// ═══════════════════════════════════════════════════════════
function drawConstellations(constellationData, animate = false) {
  // Clear old lines
  for (const line of constellationLines) {
    scene.remove(line);
  }
  constellationLines = [];

  const legendItems = document.getElementById('legend-items');
  legendItems.innerHTML = '';

  if (!constellationData || constellationData.length === 0) {
    document.getElementById('constellation-legend').classList.add('hidden');
    return;
  }

  document.getElementById('constellation-legend').classList.remove('hidden');

  constellationData.forEach((c, ci) => {
    const linePairs = c.linePairs;
    if (!linePairs || linePairs.length === 0) return;

    // Find a representative color from the constellation's stars
    const firstStar = entries.find(e => e.day_of_year === c.starDays[0]);
    const lineColor = firstStar ? firstStar.star_color_hex : '#4a4a6a';

    linePairs.forEach((pair, pi) => {
      const idxA = pair[0] - 1; // day_of_year is 1-indexed
      const idxB = pair[1] - 1;

      if (idxA < 0 || idxA >= STAR_COUNT || idxB < 0 || idxB >= STAR_COUNT) return;

      const posA = starPositions[idxA];
      const posB = starPositions[idxB];

      const points = [posA.clone(), posB.clone()];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(lineColor),
        transparent: true,
        opacity: 0,
        linewidth: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geo, mat);
      scene.add(line);
      constellationLines.push(line);

      if (animate) {
        // Animate line draw over 3 seconds, staggered
        const delay = (ci * 1000) + (pi * 200);
        setTimeout(() => {
          animateLineIn(mat, 0.25, 500);
        }, delay);
      } else {
        mat.opacity = 0.25;
      }
    });

    // Legend item
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${lineColor};box-shadow:0 0 6px ${lineColor}"></span>${c.name}`;
    legendItems.appendChild(item);
  });
}

function animateLineIn(material, targetOpacity, duration) {
  const start = performance.now();
  function step() {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    material.opacity = targetOpacity * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
  }
  step();
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ═══════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════
async function loadData() {
  entries = await window.journal.getAllEntries(currentYear);
  constellations = await window.journal.getConstellations(currentYear);

  // Update star visuals
  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;

  for (const entry of entries) {
    const idx = entry.day_of_year - 1; // 0-indexed
    if (idx < 0 || idx >= STAR_COUNT) continue;

    // ── Phase 3B: Emotion palette enrichment ──
    const enrichedHex = enrichStarColor(entry.star_color_hex, entry.valence, entry.arousal);
    const color = new THREE.Color(enrichedHex);

    // ── Phase 9: Planck Shift / Redshift Aging ──
    // New entries keep their original color. Over months, colors shift
    // toward warmer/redder tones — mimicking cosmological redshift.
    const entryTime = new Date(entry.created_at).getTime();
    const ageDays = (Date.now() - entryTime) / (1000 * 60 * 60 * 24);
    if (ageDays > 1) {
      const redshiftFactor = Math.min(0.15, (ageDays / 180) * 0.15); // max 15% at 6 months
      const hsl = {};
      color.getHSL(hsl);
      // Shift hue toward red (0.0), reduce saturation slightly
      hsl.h = hsl.h * (1 - redshiftFactor) + 0.0 * redshiftFactor;
      hsl.s = hsl.s * (1 - redshiftFactor * 0.3);
      hsl.l = hsl.l * (1 - redshiftFactor * 0.1); // slightly dimmer
      color.setHSL(hsl.h, hsl.s, hsl.l);
    }

    colorsArr[idx * 3] = color.r;
    colorsArr[idx * 3 + 1] = color.g;
    colorsArr[idx * 3 + 2] = color.b;

    // ── Phase 3A: Stellar Classification Curve ──
    // Size and class based on text length
    const textLen = Math.min(entry.text.length, 2000);
    let starSize, starClassVal;
    if (textLen < 100) {
      starSize = 3.5; starClassVal = 1.0;        // dwarf
    } else if (textLen < 300) {
      starSize = 5.0 + (textLen - 100) / 200 * 1.5; starClassVal = 2.0;  // main sequence
    } else if (textLen < 800) {
      starSize = 6.5 + (textLen - 300) / 500 * 2.0; starClassVal = 3.0;  // subgiant
    } else if (textLen < 2000) {
      starSize = 8.5 + (textLen - 800) / 1200 * 2.0; starClassVal = 4.0; // giant
    } else {
      starSize = 10.5; starClassVal = 5.0;        // supergiant
    }
    sizesArr[idx] = starSize;
    const starClassBuf = starPoints.geometry.attributes.starClass;
    if (starClassBuf) starClassBuf.array[idx] = starClassVal;

    starData[idx] = entry;

    // Persistent corona for EVERY written entry — they ARE the emergent nebula
    const ageDaysForCorona = Math.max(0, (Date.now() - entryTime) / (1000 * 60 * 60 * 24));
    addCorona(idx, entry.star_color_hex, ageDaysForCorona);

    // Phase 8: Gravitational Well for crisis entries
    const valence = entry.valence || 0;
    const arousal = entry.arousal || 0;
    if (valence < -0.3 && arousal > 0.6) {
      const wellIntensity = Math.min(1.0, (-valence + arousal) / 2);
      createGravityWell(idx, wellIntensity);
    }

    // ── Meaning Layer: visual archetypes ──
    if (window.MeaningObjects) {
      const archetypes = window.MeaningObjects.classify(entry);
      if (archetypes.length > 0) {
        window.MeaningObjects.addMeaning(idx, starPositions[idx], archetypes, entry.star_color_hex);
      }
    }
  }

  // Phase 11: Semantic Filaments
  computeFilaments(entries);

  // ── Meaning Layer: constellation threads (recurring emotions) ──
  if (window.MeaningObjects) {
    window.MeaningObjects.buildThreads(starData, starPositions);
  }

  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;
  if (starPoints.geometry.attributes.starClass) starPoints.geometry.attributes.starClass.needsUpdate = true;

  // Draw constellations (no animation on load)
  drawConstellations(constellations, false);

  // Update entry count
  updateCalendarInfo();

  // Phase 14: Load prophecies and update nebula
  await loadProphecies();
  updateNebulaClearMask();
}

// Audio system extracted to audio-engine.js (AudioEngine module)

// ═══════════════════════════════════════════════════════════
// LONGEST NIGHT MODE
// ═══════════════════════════════════════════════════════════
async function checkLongestNight() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  if (month === 11 && day === 21) {
    // December 21 — Longest Night
    const prevEntries = await window.journal.getPreviousYearEntries(currentYear);
    if (prevEntries && prevEntries.length > 0) {
      activateLongestNight(prevEntries);
    }
  }
}

function activateLongestNight(prevEntries) {
  const banner = document.getElementById('longest-night-banner');
  banner.classList.remove('hidden');

  // Light all previous year stars at full brightness
  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;

  for (const entry of prevEntries) {
    const idx = entry.day_of_year - 1;
    if (idx < 0 || idx >= STAR_COUNT) continue;

    const color = new THREE.Color(entry.star_color_hex);
    colorsArr[idx * 3] = color.r;
    colorsArr[idx * 3 + 1] = color.g;
    colorsArr[idx * 3 + 2] = color.b;
    sizesArr[idx] = WRITTEN_STAR_BASE_SIZE + 4;
  }

  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;

  // Play chime
  if (window.AudioEngine) window.AudioEngine.playConstellationChime();
}

// ═══════════════════════════════════════════════════════════
// INTERACTION — HOVER & CLICK
// ═══════════════════════════════════════════════════════════
function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(starPoints);

  const tooltip = document.getElementById('star-tooltip');

  if (intersects.length > 0) {
    const idx = intersects[0].index;
    hoveredStarIndex = idx;
    starPoints.material.uniforms.uHoveredIndex.value = idx;

    const entry = starData[idx];
    if (entry) {
      tooltip.classList.remove('hidden');
      tooltip.querySelector('.tooltip-name').textContent = entry.star_name;
      tooltip.querySelector('.tooltip-date').textContent = formatDate(entry.day_of_year, entry.year);
      tooltip.querySelector('.tooltip-emotion').textContent = entry.emotion_label;
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 10}px`;
    } else {
      tooltip.classList.remove('hidden');
      tooltip.querySelector('.tooltip-name').textContent = `Day ${idx + 1}`;
      tooltip.querySelector('.tooltip-date').textContent = formatDate(idx + 1, currentYear);
      tooltip.querySelector('.tooltip-emotion').textContent = 'unwritten';
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 10}px`;
    }

    renderer.domElement.style.cursor = 'pointer';
  } else {
    // Check real catalog stars
    let foundReal = false;
    if (window._bgStars) {
      const bgIntersects = raycaster.intersectObject(window._bgStars);
      if (bgIntersects.length > 0) {
        const bgIdx = bgIntersects[0].index;
        const catalog = typeof STAR_CATALOG !== 'undefined' ? STAR_CATALOG : [];
        if (bgIdx < catalog.length) {
          const realStar = catalog[bgIdx];
          tooltip.classList.remove('hidden');
          // Derive spectral class from B-V
          const bv = realStar.bv;
          const spectral = bv < -0.1 ? 'B' : bv < 0.3 ? 'A' : bv < 0.6 ? 'F' : bv < 0.8 ? 'G' : bv < 1.2 ? 'K' : 'M';
          tooltip.querySelector('.tooltip-name').textContent = realStar.name;
          tooltip.querySelector('.tooltip-date').textContent = `mag ${realStar.mag.toFixed(1)} · Type ${spectral}`;
          tooltip.querySelector('.tooltip-emotion').textContent = `RA ${realStar.ra.toFixed(2)}h · Dec ${realStar.dec.toFixed(1)}°`;
          tooltip.style.left = `${event.clientX + 16}px`;
          tooltip.style.top = `${event.clientY - 10}px`;
          renderer.domElement.style.cursor = 'crosshair';
          foundReal = true;
        }
      }
    }

    // Check planets — use celestial tracker if available
    if (!foundReal && window.CelestialRenderer && window.CelestialRenderer.isVisible()) {
      raycaster.setFromCamera(mouse, camera);
      const hit = window.CelestialRenderer.hitTest(raycaster);
      if (hit) {
        tooltip.classList.remove('hidden');
        if (hit.type === 'planet') {
          tooltip.querySelector('.tooltip-name').textContent = hit.data.label || hit.data.name;
          tooltip.querySelector('.tooltip-date').textContent = hit.data.dist !== undefined
            ? `${hit.data.dist.toFixed(3)} AU`
            : (hit.data.name === 'moon' ? `${(hit.data.dist * 149597870.7).toFixed(0)} km` : '');
          const raStr = hit.data.ra !== undefined ? `RA ${hit.data.ra.toFixed(2)}h` : '';
          const decStr = hit.data.dec !== undefined ? `Dec ${hit.data.dec.toFixed(1)}°` : '';
          tooltip.querySelector('.tooltip-emotion').textContent = `${raStr} · ${decStr}`;
        } else if (hit.type === 'iss') {
          tooltip.querySelector('.tooltip-name').textContent = '🛰 ISS';
          tooltip.querySelector('.tooltip-date').textContent = hit.data.lat !== undefined
            ? `Lat ${hit.data.lat.toFixed(1)}° Lon ${hit.data.lon.toFixed(1)}°` : 'Low Earth Orbit';
          tooltip.querySelector('.tooltip-emotion').textContent = `Alt: ${hit.data.altitude || 420} km · ${hit.data.velocity || 7.66} km/s`;
        } else if (hit.type === 'sentry') {
          tooltip.querySelector('.tooltip-name').textContent = `⚠ ${hit.data.name || hit.data.designation}`;
          tooltip.querySelector('.tooltip-date').textContent = `Torino: ${hit.data.torino ?? 'N/A'} · Palermo: ${hit.data.palermo?.toFixed(2) || 'N/A'}`;
          tooltip.querySelector('.tooltip-emotion').textContent = `Impact prob: ${hit.data.impactProb?.toExponential(2) || 'N/A'}${hit.data.diameter ? ` · Ø ${hit.data.diameter.toFixed(2)} km` : ''}`;
        } else if (hit.type === 'neo') {
          const d = hit.data;
          const hazard = d.isPotentiallyHazardous ? '⚠ ' : '';
          tooltip.querySelector('.tooltip-name').textContent = `${hazard}${d.name}`;
          const missLD = d.missDistanceLunar != null ? `${d.missDistanceLunar.toFixed(1)} LD` : '';
          const missKm = d.missDistanceKm != null ? `${(d.missDistanceKm / 1e6).toFixed(2)}M km` : '';
          tooltip.querySelector('.tooltip-date').textContent = `Miss: ${missLD}${missLD && missKm ? ' · ' : ''}${missKm}`;
          const vel = d.velocityKmS != null ? `${d.velocityKmS.toFixed(1)} km/s` : '';
          const diam = (d.diameterMin != null && d.diameterMax != null)
            ? `Ø ${Math.round(d.diameterMin)}-${Math.round(d.diameterMax)}m`
            : '';
          const dateStr = d.closeApproachDate ? ` · ${d.closeApproachDate}` : '';
          tooltip.querySelector('.tooltip-emotion').textContent = `${vel}${vel && diam ? ' · ' : ''}${diam}${dateStr}`;
        } else if (hit.type === 'dso') {
          const d = hit.data;
          const typeIcon = d.dsoType === 'nebula' ? '🌀' : d.dsoType === 'galaxy' ? '🌌' : '✨';
          tooltip.querySelector('.tooltip-name').textContent = `${typeIcon} ${d.name}`;
          tooltip.querySelector('.tooltip-date').textContent = `${d.id} · Mag ${d.magnitude} · ${d.dsoType}`;
          tooltip.querySelector('.tooltip-emotion').textContent = d.description;
        } else if (hit.type === 'meteor') {
          const d = hit.data;
          const peakStr = d.isNearPeak ? ' 🔥 ACTIVE NOW' : '';
          tooltip.querySelector('.tooltip-name').textContent = `☄ ${d.name}${peakStr}`;
          tooltip.querySelector('.tooltip-date').textContent = `Peak: ${d.peakDate} · ZHR: ${d.zhr} meteors/hr`;
          tooltip.querySelector('.tooltip-emotion').textContent = `Parent: ${d.parent}`;
        }
        tooltip.style.left = `${event.clientX + 16}px`;
        tooltip.style.top = `${event.clientY - 10}px`;
        renderer.domElement.style.cursor = 'crosshair';
        foundReal = true;
      }
    }

    if (!foundReal) {
      // Legacy planet tooltip fallback
      for (const ps of planetSprites) {
        const screenPos = ps.position.clone().project(camera);
        const dx = (screenPos.x * 0.5 + 0.5) * window.innerWidth - event.clientX;
        const dy = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight - event.clientY;
        if (Math.sqrt(dx * dx + dy * dy) < 20 && screenPos.z < 1) {
          tooltip.classList.remove('hidden');
          tooltip.querySelector('.tooltip-name').textContent = ps.userData.planetName;
          tooltip.querySelector('.tooltip-date').textContent = 'Planet';
          tooltip.querySelector('.tooltip-emotion').textContent = '';
          tooltip.style.left = `${event.clientX + 16}px`;
          tooltip.style.top = `${event.clientY - 10}px`;
          renderer.domElement.style.cursor = 'crosshair';
          foundReal = true;
          break;
        }
      }
    }
    if (!foundReal) {
      hoveredStarIndex = -1;
      starPoints.material.uniforms.uHoveredIndex.value = -1;
      tooltip.classList.add('hidden');
      renderer.domElement.style.cursor = 'default';
    }
  }
}

function onMouseClick(event) {
  if (isWritePanelOpen || isOverlayOpen || isDragging) return;

  raycaster.setFromCamera(mouse, camera);

  // ── Check planet sprites first ──
  if (window.CelestialRenderer && window.CelestialRenderer._getGroup()) {
    const cGroup = window.CelestialRenderer._getGroup();
    const planetHits = raycaster.intersectObjects(cGroup.children, true);
    for (const hit of planetHits) {
      let obj = hit.object;
      while (obj && !obj.userData.type) obj = obj.parent;
      if (obj && obj.userData.type === 'planet') {
        showPlanetDetail(obj.userData.name);
        return;
      }
    }
  }

  const intersects = raycaster.intersectObject(starPoints);

  if (intersects.length > 0) {
    const idx = intersects[0].index;
    const entry = starData[idx];
    const dayOfYear = idx + 1;
    const todayDOY = getDayOfYear();

    // Smooth fly-to the star
    if (starPositions[idx]) {
      flyToStar(starPositions[idx]);
    }

    if (entry) {
      // Existing entry — show overlay
      setTimeout(() => openEntryOverlay(entry), 600);
    } else if (dayOfYear > todayDOY) {
      // Future star — Prophecy flow (Phase 14)
      setTimeout(() => openProphecyPanel(dayOfYear, currentYear), 600);
    } else {
      // Past/today unwritten — write entry
      setTimeout(() => openWritePanel(dayOfYear), 600);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PLANET DETAIL — Real mission/probe/rover data
// ═══════════════════════════════════════════════════════════
const PLANET_DATA = {
  sun: {
    type: 'G2V Main Sequence Star',
    diameter: '1,392,700 km',
    distance: '1 AU (149.6M km)',
    period: '—',
    missions: [
      'Parker Solar Probe — closest approach 6.16M km (2025)',
      'Solar Orbiter (ESA) — polar observations',
      'SDO — Solar Dynamics Observatory',
      'SOHO — Solar and Heliospheric Observatory'
    ],
    fact: 'Parker Solar Probe became the fastest human-made object at 635,266 km/h.'
  },
  moon: {
    type: 'Natural Satellite',
    diameter: '3,474 km',
    distance: '384,400 km',
    period: '27.3 days',
    missions: [
      'Artemis III — crewed lunar landing (planned 2026)',
      'VIPER — Volatiles Investigating Polar Exploration Rover',
      'Chang\'e 6 — far-side sample return (2024)',
      'Lunar Gateway — orbital station (under construction)',
      'SLIM (JAXA) — precision lander (2024)'
    ],
    fact: 'Chang\'e 6 returned the first samples from the Moon\'s far side in June 2024.'
  },
  mercury: {
    type: 'Terrestrial Planet',
    diameter: '4,880 km',
    distance: '0.39 AU',
    period: '88 days',
    missions: [
      'BepiColombo (ESA/JAXA) — en route, arrival 2025',
      'MESSENGER — mapped entire surface (2011-2015)'
    ],
    fact: 'MESSENGER discovered water ice in permanently shadowed craters at Mercury\'s poles.'
  },
  venus: {
    type: 'Terrestrial Planet',
    diameter: '12,104 km',
    distance: '0.72 AU',
    period: '225 days',
    missions: [
      'VERITAS (NASA) — orbital radar mapper (planned)',
      'DAVINCI (NASA) — atmospheric descent probe (planned)',
      'EnVision (ESA) — orbital study (planned 2031)',
      'Akatsuki (JAXA) — atmospheric orbiter (active)'
    ],
    fact: 'Venus rotates backwards (retrograde) and a day on Venus is longer than its year.'
  },
  mars: {
    type: 'Terrestrial Planet',
    diameter: '6,779 km',
    distance: '1.52 AU',
    period: '687 days',
    missions: [
      'Perseverance Rover — Jezero Crater sample caching',
      'Ingenuity Helicopter — 72 flights completed',
      'Curiosity Rover — Gale Crater (12+ years active)',
      'Mars Reconnaissance Orbiter — HiRISE imaging',
      'MAVEN — upper atmosphere study',
      'Tianwen-1 / Zhurong (CNSA) — Utopia Planitia',
      'Mars Express (ESA) — orbital science (20+ years)'
    ],
    fact: 'Perseverance has cached 23 sample tubes for Earth return via Mars Sample Return mission.'
  },
  jupiter: {
    type: 'Gas Giant',
    diameter: '139,820 km',
    distance: '5.20 AU',
    period: '11.86 years',
    missions: [
      'Juno — polar orbiter, deep atmosphere mapping (active)',
      'JUICE (ESA) — Jupiter Icy Moons Explorer (en route, arrival 2031)',
      'Europa Clipper (NASA) — ice shell study (launched 2024)',
      'Galileo — atmospheric probe + orbiter (1995-2003)'
    ],
    fact: 'Juno discovered that Jupiter\'s Great Red Spot extends 500 km into the atmosphere.'
  },
  saturn: {
    type: 'Gas Giant',
    diameter: '116,460 km',
    distance: '9.54 AU',
    period: '29.46 years',
    missions: [
      'Dragonfly — Titan rotorcraft lander (launch 2028)',
      'Cassini-Huygens — 13 years of exploration (1997-2017)',
      'Huygens — first landing on Titan (2005)'
    ],
    fact: 'Cassini discovered geysers on Enceladus erupting water ice, suggesting a subsurface ocean.'
  },
  uranus: {
    type: 'Ice Giant',
    diameter: '50,724 km',
    distance: '19.19 AU',
    period: '84.01 years',
    missions: [
      'Uranus Orbiter & Probe — #1 Decadal Survey priority (planned)',
      'Voyager 2 — only flyby (1986)'
    ],
    fact: 'Uranus rotates on its side at 97.8° tilt — possibly from an ancient collision.'
  },
  neptune: {
    type: 'Ice Giant',
    diameter: '49,528 km',
    distance: '30.07 AU',
    period: '164.8 years',
    missions: [
      'Voyager 2 — only flyby (1989)',
      'No active missions — next visit TBD'
    ],
    fact: 'Neptune has the fastest winds in the solar system — up to 2,100 km/h.'
  },
  pluto: {
    type: 'Dwarf Planet',
    diameter: '2,377 km',
    distance: '39.48 AU',
    period: '248 years',
    missions: [
      'New Horizons — flyby (2015), now in Kuiper Belt',
    ],
    fact: 'New Horizons revealed Pluto\'s heart-shaped nitrogen ice glacier, Sputnik Planitia.'
  }
};

function showPlanetDetail(planetName) {
  const data = PLANET_DATA[planetName];
  if (!data) return;

  const vis = window.OrbitalMechanics && window.OrbitalMechanics.PLANET_VISUALS[planetName];
  const label = vis ? vis.label : planetName;

  document.getElementById('planet-detail-name').textContent = label;
  document.getElementById('planet-detail-type').textContent = data.type;

  // Stats grid
  const statsEl = document.getElementById('planet-detail-stats');
  statsEl.innerHTML = [
    `<div style="font-size:11px;color:rgba(180,180,210,0.4);">DIAMETER</div><div style="font-size:14px;color:#e0e0f0;">${data.diameter}</div>`,
    `<div style="font-size:11px;color:rgba(180,180,210,0.4);">DISTANCE</div><div style="font-size:14px;color:#e0e0f0;">${data.distance}</div>`,
    `<div style="font-size:11px;color:rgba(180,180,210,0.4);">ORBITAL PERIOD</div><div style="font-size:14px;color:#e0e0f0;">${data.period}</div>`,
  ].join('');

  // Mission list
  const missionEl = document.getElementById('planet-detail-mission-list');
  missionEl.innerHTML = data.missions.map(m => `<div style="padding:2px 0;">• ${m}</div>`).join('');

  // Fact
  document.getElementById('planet-detail-facts').textContent = data.fact;

  // Show panel
  document.getElementById('planet-detail-popup').classList.remove('hidden');

  // Close handler
  document.getElementById('planet-detail-close').onclick = () => {
    document.getElementById('planet-detail-popup').classList.add('hidden');
  };
}

// ═══════════════════════════════════════════════════════════
// ENTRY OVERLAY
// ═══════════════════════════════════════════════════════════
function openEntryOverlay(entry) {
  isOverlayOpen = true;
  currentOverlayEntry = entry;
  const overlay = document.getElementById('entry-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('entry-star-indicator').style.backgroundColor = entry.star_color_hex;
  document.getElementById('entry-star-indicator').style.boxShadow = `0 0 20px ${entry.star_color_hex}`;
  document.getElementById('entry-star-name').textContent = entry.star_name;
  document.getElementById('entry-date').textContent = formatDate(entry.day_of_year, entry.year);
  document.getElementById('entry-emotion-label').textContent = entry.emotion_label;

  // Show edit/delete buttons
  let actionsEl = document.getElementById('entry-actions');
  if (!actionsEl) {
    actionsEl = document.createElement('div');
    actionsEl.id = 'entry-actions';
    actionsEl.style.cssText = 'display:flex;gap:12px;margin-top:16px;';
    actionsEl.innerHTML = `
      <button id="entry-edit-btn" style="padding:8px 20px;border:1px solid rgba(212,175,55,0.3);background:rgba(212,175,55,0.1);color:#d4af37;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.3s;">✎ Edit</button>
      <button id="entry-delete-btn" style="padding:8px 20px;border:1px solid rgba(220,60,60,0.3);background:rgba(220,60,60,0.1);color:#dc3c3c;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.3s;">✕ Delete</button>
    `;
    document.querySelector('.entry-overlay-content').appendChild(actionsEl);

    document.getElementById('entry-edit-btn').addEventListener('click', () => {
      if (!currentOverlayEntry) return;
      closeEntryOverlay();
      openWritePanel(currentOverlayEntry.day_of_year, currentOverlayEntry.text);
    });

    document.getElementById('entry-delete-btn').addEventListener('click', async () => {
      if (!currentOverlayEntry) return;
      if (confirm(`Delete entry for ${formatDate(currentOverlayEntry.day_of_year, currentOverlayEntry.year)}?`)) {
        await window.journal.deleteEntry(currentOverlayEntry.day_of_year, currentOverlayEntry.year);
        closeEntryOverlay();
        await loadData();
      }
    });
  }

  // Staggered paragraph fade-in
  const textEl = document.getElementById('entry-text');
  const paragraphs = entry.text.split('\n').filter(p => p.trim());
  textEl.innerHTML = '';
  paragraphs.forEach((p, i) => {
    const span = document.createElement('div');
    span.className = 'paragraph';
    span.textContent = p;
    span.style.animationDelay = `${i * 150}ms`;
    textEl.appendChild(span);
  });

  // Play star tone
  if (window.AudioEngine) window.AudioEngine.playStarTone(entry.star_temperature_k);

  // Phase 10: Light Echo for old entries (>24h)
  const echoAge = Date.now() - new Date(entry.created_at).getTime();
  if (echoAge > CORONA_DURATION_MS) {
    triggerLightEcho(entry.day_of_year - 1, entry.star_color_hex);
  }
}

function closeEntryOverlay() {
  isOverlayOpen = false;
  document.getElementById('entry-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// WRITE PANEL
// ═══════════════════════════════════════════════════════════
function openWritePanel(dayOfYear, existingText) {
  isWritePanelOpen = true;
  const panel = document.getElementById('write-panel');
  panel.classList.remove('hidden');

  const writeDate = document.getElementById('write-date');
  writeDate.textContent = formatDate(dayOfYear || getDayOfYear(), currentYear);

  const textarea = document.getElementById('write-textarea');
  textarea.value = existingText || '';
  textarea.focus();

  // Store the target day
  panel.dataset.dayOfYear = dayOfYear || getDayOfYear();

  updateWordCount();
}

function closeWritePanel() {
  isWritePanelOpen = false;
  document.getElementById('write-panel').classList.add('hidden');
}

async function saveEntry() {
  const panel = document.getElementById('write-panel');
  const textarea = document.getElementById('write-textarea');
  const text = textarea.value.trim();

  if (!text) return;

  const dayOfYear = parseInt(panel.dataset.dayOfYear);
  const entry = await window.journal.saveEntry(dayOfYear, currentYear, text);

  // ── Compute star properties (same classification logic) ──
  const idx = dayOfYear - 1;
  const textLen = Math.min(text.length, 2000);
  let starSize, starClassVal;
  if (textLen < 100) {
    starSize = 3.5; starClassVal = 1.0;
  } else if (textLen < 300) {
    starSize = 5.0 + (textLen - 100) / 200 * 1.5; starClassVal = 2.0;
  } else if (textLen < 800) {
    starSize = 6.5 + (textLen - 300) / 500 * 2.0; starClassVal = 3.0;
  } else if (textLen < 2000) {
    starSize = 8.5 + (textLen - 800) / 1200 * 2.0; starClassVal = 4.0;
  } else {
    starSize = 10.5; starClassVal = 5.0;
  }

  // Set stellar classification immediately (shader uses it for twinkle/diffraction)
  const starClassBuf = starPoints.geometry.attributes.starClass;
  if (starClassBuf) {
    starClassBuf.array[idx] = starClassVal;
    starClassBuf.needsUpdate = true;
  }

  starData[idx] = entry;

  // ══ LIGHT A STAR: Ignite instead of instant placement ══
  igniteStar(idx, entry.star_color_hex, starSize, starClassVal);

  // Delay corona + nova burst so they appear AFTER the flash phase
  setTimeout(() => {
    addCorona(idx, entry.star_color_hex);
    if (starClassVal >= 4.0) {
      createNovaBurst(idx, entry.star_color_hex);
    }
  }, 400); // 400ms = just after flash phase ends

  // Play star tone
  if (window.AudioEngine) window.AudioEngine.playStarTone(entry.star_temperature_k);

  // Reload constellations
  entries = await window.journal.getAllEntries(currentYear);
  const newConstellations = await window.journal.getConstellations(currentYear);
  const hadPreviousConstellations = constellations.length;
  constellations = newConstellations;
  drawConstellations(constellations, constellations.length > hadPreviousConstellations);

  if (constellations.length > hadPreviousConstellations) {
    if (window.AudioEngine) window.AudioEngine.playConstellationChime();
  }

  closeWritePanel();
  updateCalendarInfo();

  // Phase 14: Update nebula clear mask
  updateNebulaClearMask();
}

function updateWordCount() {
  const textarea = document.getElementById('write-textarea');
  const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('write-word-count').textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════
// CALENDAR INFO
// ═══════════════════════════════════════════════════════════
function updateCalendarInfo() {
  const now = new Date();
  document.getElementById('current-date-label').textContent =
    now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('entry-count-label').textContent =
    `${entries.length} / 365 stars lit`;
}

// ═══════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════
function setupEvents() {
  // Mouse — click, move, and orbit drag
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('click', onMouseClick);

  // Orbit drag controls — use movement threshold to distinguish click from drag
  let isMouseDown = false;
  let mouseDownPos = { x: 0, y: 0 };
  const DRAG_THRESHOLD = 3; // pixels of movement before it counts as a drag

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !isWritePanelOpen && !isOverlayOpen) {
      isMouseDown = true;
      isDragging = false;
      mouseDownPos = { x: e.clientX, y: e.clientY };
      previousMousePos = { x: e.clientX, y: e.clientY };
    }
  });
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      isDragging = true;
      renderer.domElement.style.cursor = 'grabbing';
    }
    if (isDragging) {
      const moveDx = e.clientX - previousMousePos.x;
      const moveDy = e.clientY - previousMousePos.y;
      spherical.theta -= moveDx * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - moveDy * 0.005));
      previousMousePos = { x: e.clientX, y: e.clientY };
      updateCameraFromSpherical();
    }
  });
  window.addEventListener('mouseup', () => {
    isMouseDown = false;
    if (isDragging) {
      // Delay clearing isDragging so click handler can check it
      setTimeout(() => { isDragging = false; }, 0);
      renderer.domElement.style.cursor = 'default';
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (window._bloomComposer) window._bloomComposer.setSize(window.innerWidth, window.innerHeight);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isSettingsOpen) closeSettings();
      else if (isSearchOpen) closeSearch();
      else if (isOverlayOpen) closeEntryOverlay();
      else if (isWritePanelOpen) closeWritePanel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      if (!isWritePanelOpen && !isOverlayOpen) openWritePanel(getDayOfYear());
    }
  });

  // Write panel events
  document.getElementById('write-trigger-btn').addEventListener('click', () => {
    openWritePanel(getDayOfYear());
  });
  document.getElementById('write-save-btn').addEventListener('click', saveEntry);
  document.getElementById('write-cancel-btn').addEventListener('click', closeWritePanel);
  document.getElementById('write-panel-backdrop').addEventListener('click', closeWritePanel);
  document.getElementById('write-textarea').addEventListener('input', updateWordCount);

  // Typewriter sounds
  document.getElementById('write-textarea').addEventListener('keydown', (e) => {
    if (document.getElementById('typewriter-checkbox').checked) {
      if (window.AudioEngine) window.AudioEngine.playTypewriterClick();
    }
  });

  // Entry overlay
  document.getElementById('entry-overlay-backdrop').addEventListener('click', closeEntryOverlay);
  document.getElementById('entry-close-btn').addEventListener('click', closeEntryOverlay);

  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => window.journal.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.journal.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.journal.close());

  // Sound toggle — delegated to AudioEngine module
  document.getElementById('btn-sound-toggle').addEventListener('click', () => {
    if (window.AudioEngine) {
      window.AudioEngine.init();
      const nowEnabled = !window.AudioEngine.isEnabled();
      window.AudioEngine.setEnabled(nowEnabled);
      document.getElementById('btn-sound-toggle').textContent = nowEnabled ? '🔊' : '🔇';
      if (nowEnabled) window.AudioEngine.startAmbient();
    }
  });

  // Constellation lines toggle
  const constBtn = document.getElementById('btn-constellations-toggle');
  if (constBtn) {
    constBtn.style.opacity = '0.5';
    constBtn.addEventListener('click', toggleRealConstellations);
  }

  // ── Celestial Tracker toggle ──
  const celestialBtn = document.getElementById('btn-celestial-toggle');
  const celestialInfoBtn = document.getElementById('btn-celestial-info');
  const celestialPanel = document.getElementById('celestial-info-panel');

  if (celestialBtn && window.CelestialRenderer) {
    celestialBtn.addEventListener('click', () => {
      const visible = !window.CelestialRenderer.isVisible();
      window.CelestialRenderer.setVisible(visible);
      celestialBtn.style.opacity = visible ? '1' : '0.5';
      if (celestialInfoBtn) celestialInfoBtn.style.display = visible ? '' : 'none';
      if (!visible && celestialPanel) celestialPanel.classList.add('hidden');
    });
  }

  if (celestialInfoBtn && celestialPanel) {
    celestialInfoBtn.addEventListener('click', () => {
      celestialPanel.classList.toggle('hidden');
      if (!celestialPanel.classList.contains('hidden')) updateCelestialInfoPanel();
    });
  }

  // ── Layer toggle checkboxes ──
  if (window.SkyLayerManager) {
    const layerClasses = ['reference', 'celestial', 'personal', 'signal'];
    for (const cls of layerClasses) {
      const checkbox = document.getElementById(`layer-toggle-${cls}`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          window.SkyLayerManager.setClassVisible(cls, e.target.checked);
          // Also sync the celestial renderer visibility for the celestial class
          if (cls === 'celestial' && window.CelestialRenderer) {
            window.CelestialRenderer.setVisible(e.target.checked);
          }
        });
      }
    }
  }

  // Info panel auto-refresh
  setInterval(() => {
    if (celestialPanel && !celestialPanel.classList.contains('hidden')) {
      updateCelestialInfoPanel();
      // Update layer stats
      if (window.SkyLayerManager) {
        const stats = window.SkyLayerManager.getStats();
        const statsEl = document.getElementById('ci-layer-stats');
        if (statsEl) {
          statsEl.textContent = `${stats.visibleLayers}/${stats.totalLayers} layers visible · ${stats.totalObjects} objects tracked`;
        }
      }
    }
  }, 10000);

  // ── Time Slider: Phase 5 ──
  if (window.TimeEngine) {
    const timeSlider = document.getElementById('time-slider');
    const timeLiveBtn = document.getElementById('time-live-btn');
    const timePlayBtn = document.getElementById('time-play-btn');
    const timeSpeedBtn = document.getElementById('time-speed-btn');
    const timeLabel = document.getElementById('time-label');

    // Initialize label
    if (timeLabel) timeLabel.textContent = window.TimeEngine.getLabel();
    if (timeSlider) {
      timeSlider.value = window.TimeEngine.getSliderValue();

      timeSlider.addEventListener('mousedown', () => { timeSlider._userDragging = true; });
      timeSlider.addEventListener('touchstart', () => { timeSlider._userDragging = true; });

      timeSlider.addEventListener('input', () => {
        const doy = parseInt(timeSlider.value);
        window.TimeEngine.setDayOfYear(doy);
        // Refresh meteor showers for the new date
        if (window.MeteorRenderer) {
          window.MeteorRenderer.refreshShowers(window.TimeEngine.getDate());
        }
      });

      timeSlider.addEventListener('mouseup', () => { timeSlider._userDragging = false; });
      timeSlider.addEventListener('touchend', () => { timeSlider._userDragging = false; });
    }

    if (timeLiveBtn) {
      timeLiveBtn.addEventListener('click', () => {
        window.TimeEngine.goLive();
        if (window.MeteorRenderer) window.MeteorRenderer.refreshShowers();
      });
    }

    if (timePlayBtn) {
      timePlayBtn.addEventListener('click', () => {
        const playing = window.TimeEngine.togglePlayPause();
        timePlayBtn.textContent = playing ? '❚❚' : '▶';
      });
    }

    if (timeSpeedBtn) {
      timeSpeedBtn.addEventListener('click', () => {
        const speed = window.TimeEngine.cycleSpeed();
        timeSpeedBtn.textContent = `${speed}x`;
      });
    }

    // Subscribe to time changes for meteor shower updates
    window.TimeEngine.onTimeChange((ts, date) => {
      if (window.MeteorRenderer) {
        window.MeteorRenderer.refreshShowers(date);
      }
    });
  }

  // Mouse wheel zoom
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    spherical.radius = Math.max(15, Math.min(120, spherical.radius + e.deltaY * 0.05));
    updateCameraFromSpherical();
  }, { passive: false });

  // ── Settings Panel ──
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close-btn').addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);

  document.getElementById('setting-star-size').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (starPoints && starPoints.material.uniforms.uPixelRatio) {
      starPoints.material.uniforms.uPixelRatio.value = renderer.getPixelRatio() * v;
    }
  });

  document.getElementById('setting-twinkle-speed').addEventListener('input', (e) => {
    window._twinkleSpeed = parseFloat(e.target.value);
  });

  document.getElementById('setting-auto-rotate').addEventListener('change', (e) => {
    window._autoRotate = e.target.checked;
  });

  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', importData);
  document.getElementById('btn-clear-data').addEventListener('click', clearAllData);

  // ── Search Panel ──
  document.getElementById('btn-search').addEventListener('click', openSearch);
  document.getElementById('search-close-btn').addEventListener('click', closeSearch);
  document.getElementById('search-backdrop').addEventListener('click', closeSearch);
  document.getElementById('search-input').addEventListener('input', liveSearch);

  // Ctrl+F for search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openSearch();
    }
    // Home key: reset camera to default orientation
    if (e.key === 'h' && !isWritePanelOpen && !isOverlayOpen && !isSearchOpen && !isProphecyPanelOpen) {
      spherical = { theta: 0, phi: Math.PI / 2, radius: 85 };
      targetSpherical = null;
      updateCameraFromSpherical();
    }
    // Escape closes prophecy/search
    if (e.key === 'Escape') {
      if (isProphecyPanelOpen) closeProphecyPanel();
      if (isSearchOpen) closeSearch();
    }
  });

  // ── Phase 14: Prophecy Panel ──
  document.getElementById('prophecy-close-btn').addEventListener('click', closeProphecyPanel);
  document.getElementById('prophecy-cancel-btn').addEventListener('click', closeProphecyPanel);
  document.getElementById('prophecy-save-btn').addEventListener('click', saveProphecy);

  // ── Onboarding ──
  if (!localStorage.getItem('constellation-journal-onboarded')) {
    document.getElementById('onboarding').classList.remove('hidden');
    document.getElementById('onboarding-start-btn').addEventListener('click', () => {
      document.getElementById('onboarding').classList.add('hidden');
      localStorage.setItem('constellation-journal-onboarded', 'true');
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════
let isSettingsOpen = false;
let isSearchOpen = false;
window._twinkleSpeed = 1.2;
window._autoRotate = true;

function openSettings() {
  isSettingsOpen = true;
  document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
  isSettingsOpen = false;
  document.getElementById('settings-panel').classList.add('hidden');
}

function exportData() {
  const data = {
    entries: entries,
    constellations: constellations,
    exported_at: new Date().toISOString(),
    app: 'Constellation Journal',
    version: '1.0'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `constellation-journal-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  closeSettings();
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          await window.journal.saveEntry(entry.day_of_year, entry.year, entry.text);
        }
        await loadData();
        closeSettings();
        alert(`Imported ${data.entries.length} entries successfully.`);
      } else {
        alert('Invalid journal export file.');
      }
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  input.click();
}

async function clearAllData() {
  if (!confirm('This will permanently delete ALL journal entries. Are you sure?')) return;
  if (!confirm('Last chance — this cannot be undone. Delete everything?')) return;
  // Delete each entry
  for (const entry of entries) {
    await window.journal.deleteEntry(entry.day_of_year, entry.year);
  }
  await loadData();
  closeSettings();
}

// ═══════════════════════════════════════════════════════════
// SEARCH PANEL
// ═══════════════════════════════════════════════════════════
function openSearch() {
  isSearchOpen = true;
  document.getElementById('search-panel').classList.remove('hidden');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  setTimeout(() => document.getElementById('search-input').focus(), 100);
  // Show all entries initially
  renderSearchResults(entries);
}

function closeSearch() {
  isSearchOpen = false;
  document.getElementById('search-panel').classList.add('hidden');
  clearSearchHighlights();
}

function liveSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  if (!query) {
    renderSearchResults(entries);
    clearSearchHighlights();
    return;
  }
  const filtered = entries.filter(e =>
    (e.text && e.text.toLowerCase().includes(query)) ||
    (e.star_name && e.star_name.toLowerCase().includes(query)) ||
    (e.emotion_label && e.emotion_label.toLowerCase().includes(query))
  );
  renderSearchResults(filtered);
  highlightSearchResults(filtered);
}

function renderSearchResults(results) {
  const container = document.getElementById('search-results');
  if (!results.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:12px;padding:20px;">No entries found</div>';
    return;
  }
  container.innerHTML = results.map(e => `
    <div class="search-result-item" data-day="${e.day_of_year}" data-year="${e.year}">
      <div class="search-result-name">${e.star_name || 'Unnamed'}</div>
      <div class="search-result-date">${formatDate(e.day_of_year, e.year)} · ${e.emotion_label || ''}</div>
      <div class="search-result-preview">${(e.text || '').slice(0, 80)}${(e.text || '').length > 80 ? '...' : ''}</div>
    </div>
  `).join('');

  // Click handler for results
  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const day = parseInt(item.dataset.day);
      const year = parseInt(item.dataset.year);
      const entry = entries.find(e => e.day_of_year === day && e.year === year);
      if (entry) {
        closeSearch();
        const idx = entry.day_of_year - 1;
        if (starPositions[idx]) {
          flyToStar(starPositions[idx]);
        }
        setTimeout(() => openEntryOverlay(entry), 600);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════
function animate() {
  animationId = requestAnimationFrame(animate);

  if (isContextLost) return; // Halt loop gracefully while disconnected from GPU

  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;

  // ══ BIRTH MOMENT: World-freeze — subsystems pause, only ignition plays ══
  const FREEZE_DURATION_MS = 150;
  let worldFrozen = false;
  if (window._birthMomentFreeze) {
    const freezeElapsed = performance.now() - window._birthMomentFreeze;
    if (freezeElapsed < FREEZE_DURATION_MS) {
      worldFrozen = true;
    } else {
      window._birthMomentFreeze = null; // unfreeze
    }
  }

  // ── Error-guarded subsystem helper ──
  // Each subsystem gets its own try/catch so one crash can't freeze the UI.
  // Errors are logged once per subsystem to avoid flooding the console.
  if (!animate._errorLogged) animate._errorLogged = new Set();
  function guard(name, fn) {
    try { fn(); }
    catch (e) {
      if (!animate._errorLogged.has(name)) {
        console.error(`[animate:${name}] Error:`, e);
        animate._errorLogged.add(name);
      }
    }
  }

  guard('flyTo', () => updateFlyTo(dt));

  guard('shaderUniforms', () => {
    starPoints.material.uniforms.uTime.value = elapsed;
    if (nebulaUniforms) nebulaUniforms.uTime.value = elapsed;
    if (window._bgStars && window._bgStars.userData.material) {
      window._bgStars.userData.material.uniforms.uTime.value = elapsed;
    }
  });

  // Slow auto-rotation (only when not dragging or flying)
  if (window._autoRotate && !isDragging && !targetSpherical) {
    spherical.theta += 0.00001;
    updateCameraFromSpherical();
  }

  // ── Camera breathing: context-aware FOV oscillation ──
  if (!worldFrozen) {
    const coronaDensity = Math.min(coronaSprites.length / 100, 1.0); // 0—1
    const isIgniting = activeIgnitions.length > 0;
    let breathAmp, breathFreq;
    if (isIgniting) {
      breathAmp = 0.1;  // stabilize during ignition
      breathFreq = 0.005;
    } else if (coronaDensity > 0.5) {
      breathAmp = 0.3;  // tighter pulse near dense nebula
      breathFreq = 0.015;
    } else {
      breathAmp = 0.5;  // slow wide drift in sparse sky
      breathFreq = 0.008;
    }
    camera.fov = 60 + breathAmp * Math.sin(elapsed * breathFreq * Math.PI * 2);
    camera.updateProjectionMatrix();
  }

  // Calendar ring follows sphere rotation slightly
  if (calendarRing) {
    calendarRing.rotation.z = elapsed * 0.00005;
  }

  // Ambient brightness based on time — very subtle twilight shift
  guard('ambientBrightness', () => {
    const now = window.TimeEngine ? window.TimeEngine.getDate() : new Date();
    const hour = now.getHours();
    let ambientBrightness = 0.0;
    if (hour >= 6 && hour < 18) {
      ambientBrightness = 0.003 * Math.sin(((hour - 6) / 12) * Math.PI);
    }
    scene.background.setRGB(
      ambientBrightness * 0.02,
      ambientBrightness * 0.02,
      ambientBrightness * 0.04
    );
  });

  guard('coronas', () => updateCoronas());
  guard('ignitions', () => updateIgnitions());
  guard('lightEcho', () => updateLightEcho());
  guard('gravityWells', () => updateGravityWells(elapsed));
  guard('nebulaFog', () => updateNebulaFog(elapsed));
  guard('prophecyBurst', () => updateProphecyBurst());

  // ── Celestial Tracker per-frame animation ──
  guard('celestialRenderer', () => {
    if (window.CelestialRenderer && window.CelestialRenderer.isVisible()) {
      window.CelestialRenderer.update(dt);
    }
  });

  // ── Meaning Objects animation ──
  guard('meaningObjects', () => {
    if (window.MeaningObjects) {
      window.MeaningObjects.update(dt);
    }
  });

  // ── Time Engine tick + slider UI ──
  guard('timeEngine', () => {
    if (window.TimeEngine) {
      window.TimeEngine.tick(dt);
      const state = window.TimeEngine.getState();
      const slider = document.getElementById('time-slider');
      const label = document.getElementById('time-label');
      const liveBtn = document.getElementById('time-live-btn');
      const playBtn = document.getElementById('time-play-btn');
      if (slider && !slider._userDragging) slider.value = state.doy;
      if (label) label.textContent = state.label;
      if (liveBtn) liveBtn.style.background = state.isLive ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.1)';
      if (playBtn) playBtn.textContent = state.isPlaying ? '❚❚' : '▶';
    }
  });


  // ── Depth parallax: background stars lag camera ──
  guard('parallax', () => {
    if (window._bgStars && !worldFrozen) {
      // Background stars slightly follow camera position (5%) 
      // creating parallax — distant stars move less
      window._bgStars.position.x = camera.position.x * 0.05;
      window._bgStars.position.y = camera.position.y * 0.05;
      window._bgStars.position.z = camera.position.z * 0.05;
    }
  });

  // ── Bloom composer: init on first frame if module was late loading ──
  if (!window._bloomComposer && window.createBloomComposer) {
    window._bloomComposer = window.createBloomComposer(renderer, scene, camera);
  }

  // Render through bloom composer if available, else fallback
  if (window._bloomComposer) {
    window._bloomComposer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 14: THE PROPHECY (FUTURE STAR MESSAGES)
// Shielded State: All writes go through IPC prepared statements
// ═══════════════════════════════════════════════════════════
let prophecies = [];
let isProphecyPanelOpen = false;

async function loadProphecies() {
  prophecies = await window.journal.getAllProphecies(currentYear);
  updatePulsarStars();
}

function updatePulsarStars() {
  if (!starPoints) return;
  const pulsarArr = starPoints.geometry.attributes.isPulsar.array;
  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;

  // Reset all pulsars first
  for (let i = 0; i < STAR_COUNT; i++) pulsarArr[i] = 0.0;

  const prophecyColor = new THREE.Color(0xd4af37);
  for (const p of prophecies) {
    if (p.revealed) continue;
    const idx = p.day_of_year - 1;
    if (idx < 0 || idx >= STAR_COUNT) continue;
    pulsarArr[idx] = 1.0;
    colorsArr[idx * 3] = prophecyColor.r;
    colorsArr[idx * 3 + 1] = prophecyColor.g;
    colorsArr[idx * 3 + 2] = prophecyColor.b;
    sizesArr[idx] = WRITTEN_STAR_BASE_SIZE + 2;
  }

  starPoints.geometry.attributes.isPulsar.needsUpdate = true;
  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;
}

async function openProphecyPanel(dayOfYear, year) {
  isProphecyPanelOpen = true;
  const panel = document.getElementById('prophecy-panel');
  panel.classList.remove('hidden');
  document.getElementById('prophecy-date').textContent = formatDate(dayOfYear, year);

  // Hide all sub-panels
  document.getElementById('prophecy-sealed').classList.add('hidden');
  document.getElementById('prophecy-write').classList.add('hidden');
  document.getElementById('prophecy-revealed').classList.add('hidden');

  const existing = await window.journal.getProphecy(dayOfYear, year);

  if (existing && existing.revealed) {
    // Revealed — show text
    document.getElementById('prophecy-revealed').classList.remove('hidden');
    document.getElementById('prophecy-revealed-text').textContent = existing.text;
  } else if (existing) {
    // Sealed — show countdown
    document.getElementById('prophecy-sealed').classList.remove('hidden');
    document.getElementById('prophecy-sealed-date').textContent = formatDate(dayOfYear, year);
  } else {
    // New prophecy — show write
    document.getElementById('prophecy-write').classList.remove('hidden');
    document.getElementById('prophecy-textarea').value = '';
    document.getElementById('prophecy-textarea').focus();
  }

  // Store target
  panel.dataset.dayOfYear = dayOfYear;
  panel.dataset.year = year;
}

function closeProphecyPanel() {
  isProphecyPanelOpen = false;
  document.getElementById('prophecy-panel').classList.add('hidden');
}

async function saveProphecy() {
  const panel = document.getElementById('prophecy-panel');
  const text = document.getElementById('prophecy-textarea').value.trim();
  if (!text) return;

  const dayOfYear = parseInt(panel.dataset.dayOfYear);
  const year = parseInt(panel.dataset.year);

  await window.journal.saveProphecy(dayOfYear, year, text);
  await loadProphecies();
  closeProphecyPanel();

  // Play a mystical chime
  // Prophecy save chime
  if (window.AudioEngine && window.AudioEngine.isEnabled()) {
    window.AudioEngine.playStarTone(4500); // Low warm tone for prophecy
  }
}

// Midnight burst — triggered by main process
function onProphecyRevealed(prophecy) {
  const idx = prophecy.day_of_year - 1;
  if (idx < 0 || idx >= STAR_COUNT) return;

  // Remove pulsar flag
  const pulsarArr = starPoints.geometry.attributes.isPulsar.array;
  pulsarArr[idx] = 0.0;
  starPoints.geometry.attributes.isPulsar.needsUpdate = true;

  // Create supernova burst
  const pos = starPositions[idx];
  const burstCount = 48;
  const burstPositions = new Float32Array(burstCount * 3);
  for (let i = 0; i < burstCount; i++) {
    burstPositions[i * 3] = pos.x;
    burstPositions[i * 3 + 1] = pos.y;
    burstPositions[i * 3 + 2] = pos.z;
  }

  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
  const burstMat = new THREE.PointsMaterial({
    color: 0xd4af37,
    size: 2,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const burstPoints = new THREE.Points(burstGeo, burstMat);
  burstPoints.userData = { velocities: [], startTime: Date.now() };

  for (let i = 0; i < burstCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 0.5 + Math.random() * 1.5;
    burstPoints.userData.velocities.push({
      x: Math.sin(phi) * Math.cos(theta) * speed,
      y: Math.sin(phi) * Math.sin(theta) * speed,
      z: Math.cos(phi) * speed,
    });
  }

  scene.add(burstPoints);
  window._prophecyBurst = burstPoints;

  // Auto-show the revealed text after 1 second
  setTimeout(() => openProphecyPanel(prophecy.day_of_year, prophecy.year), 1000);

  // Reload prophecies
  loadProphecies();
}

function updateProphecyBurst() {
  if (!window._prophecyBurst) return;
  const bp = window._prophecyBurst;
  const elapsed = (Date.now() - bp.userData.startTime) / 1000;

  if (elapsed > 3) {
    scene.remove(bp);
    window._prophecyBurst = null;
    return;
  }

  const posArr = bp.geometry.attributes.position.array;
  for (let i = 0; i < bp.userData.velocities.length; i++) {
    const v = bp.userData.velocities[i];
    posArr[i * 3] += v.x * 0.016;
    posArr[i * 3 + 1] += v.y * 0.016;
    posArr[i * 3 + 2] += v.z * 0.016;
  }
  bp.geometry.attributes.position.needsUpdate = true;
  bp.material.opacity = Math.max(0, 1 - elapsed / 3);
}

// ═══════════════════════════════════════════════════════════
// PHASE 14: SEARCH HORIZON + SEARCH FILAMENTS
// Camera tween to results + temporary golden connections
// ═══════════════════════════════════════════════════════════
let searchFilamentsGroup = null;
let searchHighlightedIndices = new Set();

function highlightSearchResults(filtered) {
  if (!filtered.length) {
    clearSearchHighlights();
    return;
  }

  // Collect matching star indices
  const matchIndices = filtered.map(e => e.day_of_year - 1).filter(i => i >= 0 && i < STAR_COUNT);
  searchHighlightedIndices = new Set(matchIndices);

  // Boost matching stars, dim others via shader uniform
  starPoints.material.uniforms.uSearchDim.value = 1.0;
  const sizesArr = starPoints.geometry.attributes.size.array;
  for (const idx of matchIndices) {
    sizesArr[idx] = Math.max(sizesArr[idx], WRITTEN_STAR_BASE_SIZE + 4);
  }
  starPoints.geometry.attributes.size.needsUpdate = true;

  // Camera tween to centroid of results
  if (matchIndices.length > 0) {
    const centroid = new THREE.Vector3();
    for (const idx of matchIndices) {
      centroid.add(starPositions[idx]);
    }
    centroid.divideScalar(matchIndices.length);
    flyToStar(centroid);
  }

  // Draw search filaments
  drawSearchFilaments(matchIndices);
}

function clearSearchHighlights() {
  searchHighlightedIndices = new Set();
  starPoints.material.uniforms.uSearchDim.value = 0.0;

  // Restore original sizes
  const sizesArr = starPoints.geometry.attributes.size.array;
  for (let i = 0; i < STAR_COUNT; i++) {
    if (starData[i]) {
      sizesArr[i] = WRITTEN_STAR_BASE_SIZE + Math.min((starData[i].text || '').length, 2000) / 500 * 3;
    } else {
      sizesArr[i] = EMPTY_STAR_SIZE;
    }
  }
  // Restore pulsar sizes
  for (const p of prophecies) {
    if (p.revealed) continue;
    const idx = p.day_of_year - 1;
    if (idx >= 0 && idx < STAR_COUNT) sizesArr[idx] = WRITTEN_STAR_BASE_SIZE + 2;
  }
  starPoints.geometry.attributes.size.needsUpdate = true;

  // Clear filaments
  clearSearchFilaments();
}

function drawSearchFilaments(matchIndices) {
  clearSearchFilaments();
  if (matchIndices.length < 2) return;

  const positions = [];
  for (let i = 0; i < matchIndices.length; i++) {
    for (let j = i + 1; j < matchIndices.length; j++) {
      const p1 = starPositions[matchIndices[i]];
      const p2 = starPositions[matchIndices[j]];
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  if (positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xd4af37,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    searchFilamentsGroup = new THREE.LineSegments(geo, mat);
    searchFilamentsGroup.renderOrder = 2;
    scene.add(searchFilamentsGroup);
  }
}

function clearSearchFilaments() {
  if (searchFilamentsGroup) {
    scene.remove(searchFilamentsGroup);
    searchFilamentsGroup = null;
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 14: NEBULA FOG / CLEARING (PERLIN NOISE)
// Unwritten stars shrouded in fog that clears as you write
// ═══════════════════════════════════════════════════════════
let nebulaMesh = null;
let nebulaFogUniforms = null;

function createNebulaFog() {
  // Build a clear mask: RGBA, 1 pixel per star day. R = clear state (0 or 255)
  const clearData = new Uint8Array(STAR_COUNT * 4);
  for (let i = 0; i < STAR_COUNT; i++) {
    clearData[i * 4] = starData[i] ? 255 : 0;     // R = clearness
    clearData[i * 4 + 1] = 0;                      // G
    clearData[i * 4 + 2] = 0;                      // B
    clearData[i * 4 + 3] = 255;                    // A
  }

  const clearTex = new THREE.DataTexture(clearData, STAR_COUNT, 1, THREE.RGBAFormat);
  clearTex.needsUpdate = true;

  nebulaFogUniforms = {
    uTime: { value: 0 },
    uClearMask: { value: clearTex },
    uTotalStars: { value: STAR_COUNT },
    uOpacity: { value: 0.08 },  // subtle — not overwhelming
  };

  const nebulaGeo = new THREE.SphereGeometry(SPHERE_RADIUS - 2, 64, 32);
  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: nebulaFogUniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vWorldPos = position;
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uClearMask;
      uniform float uTotalStars;
      uniform float uOpacity;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      // 3D Perlin-style noise (simplex approximation)
      vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x4 = x_ * ns.x + ns.yyyy;
        vec4 y4 = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x4) - abs(y4);
        vec4 b0 = vec4(x4.xy, y4.xy);
        vec4 b1 = vec4(x4.zw, y4.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        // Edge fade: use normal/view angle to softly dissolve sphere boundary
        float edgeFade = abs(dot(vNormal, vViewDir));
        edgeFade = smoothstep(0.0, 0.6, edgeFade); // fade near grazing angles

        // Map UV.x to star index, sample clear mask
        float starIdx = floor(vUv.x * uTotalStars);
        float cleared = texture2D(uClearMask, vec2((starIdx + 0.5) / uTotalStars, 0.5)).r;

        // Multi-octave noise for volumetric feel
        vec3 noiseCoord = vWorldPos * 0.08 + vec3(uTime * 0.01, 0.0, uTime * 0.005);
        float n = snoise(noiseCoord) * 0.5 + 0.5;
        n += 0.3 * (snoise(noiseCoord * 2.0) * 0.5 + 0.5);
        n += 0.15 * (snoise(noiseCoord * 4.0) * 0.5 + 0.5);
        n = clamp(n / 1.45, 0.0, 1.0);

        // Fog only appears WHERE entries exist (grows from thoughts)
        float fogDensity = n * cleared * uOpacity * edgeFade;

        // Warm gold fog color — nebula born from your writing
        vec3 fogColor = vec3(0.18, 0.12, 0.04);

        // Also add adjacent clearing (smooth radius from cleared stars)
        fogDensity *= smoothstep(0.0, 0.15, abs(vUv.x - (starIdx + 0.5) / uTotalStars) + (1.0 - cleared) * 0.5);

        gl_FragColor = vec4(fogColor, fogDensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  nebulaMesh = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebulaMesh.renderOrder = 0;
  scene.add(nebulaMesh);
}

function updateNebulaFog(elapsed) {
  if (!nebulaFogUniforms) return;
  nebulaFogUniforms.uTime.value = elapsed;
}

function updateNebulaClearMask() {
  if (!nebulaFogUniforms || !nebulaFogUniforms.uClearMask) return;
  const tex = nebulaFogUniforms.uClearMask.value;
  const data = tex.image.data;
  for (let i = 0; i < STAR_COUNT; i++) {
    data[i * 4] = starData[i] ? 255 : 0; // R channel only
  }
  tex.needsUpdate = true;

  // Update sky cleared percentage
  const written = entries.length;
  const pct = Math.round((written / 365) * 100);
  const label = document.getElementById('sky-cleared-label');
  if (label) label.textContent = `· ${pct}% nebula grown`;
}

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// CELESTIAL TRACKER INFO PANEL UPDATE
// ═══════════════════════════════════════════════════════════
function updateCelestialInfoPanel() {
  if (!window.CelestialTracker) return;
  const summary = window.CelestialTracker.getSummary();

  // Closest NEO
  const neoEl = document.getElementById('ci-closest-neo');
  if (neoEl && summary.closestNEO) {
    const h = summary.closestNEO.hazardous ? ' ⚠ HAZARDOUS' : '';
    neoEl.innerHTML = `<strong>${summary.closestNEO.name}</strong>${h}<br>` +
      `${summary.closestNEO.distanceLunar} lunar distances<br>` +
      `<span style="color:rgba(180,180,210,0.5);font-size:11px;">${summary.closestNEO.date}</span>`;
  } else if (neoEl) {
    neoEl.textContent = 'No close approaches in next 7 days';
  }

  // NEO count
  const countEl = document.getElementById('ci-neo-count');
  if (countEl) {
    countEl.textContent = `${summary.neoCount} objects tracked · ${summary.hazardousCount} potentially hazardous`;
  }

  // Sentry
  const sentryEl = document.getElementById('ci-sentry');
  if (sentryEl) {
    sentryEl.textContent = `${summary.sentryCount} objects on Sentry watch list`;
  }

  // Solar weather
  const solarEl = document.getElementById('ci-solar');
  if (solarEl) {
    const sw = summary.solarWeather;
    const parts = [];
    if (sw.cmes > 0) parts.push(`${sw.cmes} CMEs`);
    if (sw.flares > 0) parts.push(`${sw.flares} solar flares`);
    if (sw.storms > 0) parts.push(`${sw.storms} geomagnetic storms (Kp ${sw.kpMax})`);
    solarEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Quiet — no active events';
  }

  // ISS
  const issEl = document.getElementById('ci-iss');
  if (issEl) {
    if (summary.issVisible) {
      issEl.textContent = `Lat ${summary.issLat.toFixed(1)}° · Lon ${summary.issLon.toFixed(1)}°`;
    } else {
      issEl.textContent = 'Position unavailable';
    }
  }

  // Planets
  const planetsEl = document.getElementById('ci-planets');
  if (planetsEl) {
    const planets = window.CelestialTracker.getPlanets();
    if (planets && planets.length > 0) {
      planetsEl.innerHTML = planets
        .filter(p => p.name !== 'sun')
        .map(p => {
          const label = p.name.charAt(0).toUpperCase() + p.name.slice(1);
          const dist = p.name === 'moon'
            ? `${p.distKm ? p.distKm.toFixed(0) + ' km' : (p.dist * 149597870.7).toFixed(0) + ' km'}`
            : `${p.dist.toFixed(2)} AU`;
          return `<div style="display:flex;justify-content:space-between;padding:2px 0;">` +
            `<span>${label}</span>` +
            `<span style="color:rgba(180,180,210,0.5);font-size:12px;">RA ${p.ra.toFixed(1)}h · ${dist}</span></div>`;
        }).join('');
    }
  }
}

init().catch(console.error);
