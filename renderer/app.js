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
const CORONA_DURATION_MS = 86400000; // 24 hours

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
let audioCtx = null;
let soundEnabled = false;
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
  const targetRadius = Math.max(40, spherical.radius - 15); // zoom in slightly

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
  scene.background = new THREE.Color(0x010104);
  scene.fog = new THREE.FogExp2(0x010104, 0.0008);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 85);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('canvas-container').appendChild(renderer.domElement);

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
  createNebula();
  createMilkyWay();
  createStars();
  createCalendarRing();
  createRealConstellationLines();
  createPlanets();

  // Load data
  await loadData();

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
  const fillerCount = 2000;
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

    // Magnitude-based sizing: Sirius (-1.46) → 6px, Vega (0.03) → 4px, mag 4 → 0.8px
    const magNorm = (star.mag + 1.5) / 5.5; // 0 = brightest, 1 = faintest
    sizes[i] = Math.max(0.8, 6.0 * Math.pow(1 - Math.min(1, magNorm), 1.5));
  }

  for (let i = 0; i < fillerCount; i++) {
    const idx = count + i;
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 100 + Math.random() * 60;
    positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.cos(phi);
    const v = 0.55 + Math.random() * 0.3;
    colors[idx * 3] = v;
    colors[idx * 3 + 1] = v;
    colors[idx * 3 + 2] = v + 0.05;
    sizes[idx] = 0.3 + Math.random() * 0.4;
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
      uniform float uPixelRatio;
      uniform float uTime;
      // Pseudo-random hash for per-star scintillation phase
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      void main() {
        vColor = color;
        // Each star twinkles at its own rate and phase
        float phase = hash(position) * 6.2832;
        float rate = 0.2 + hash(position.zxy) * 0.5;
        vTwinkle = 0.75 + 0.25 * sin(uTime * rate + phase);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = starSize * uPixelRatio * (400.0 / -mvPos.z) * vTwinkle;
        // MUST clamp to 1.5 minimum. If < 1.0, it renders a 1x1 square and gl_PointCoord fails.
        gl_PointSize = max(gl_PointSize, 1.5);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        // Soft radial glow: bright center, smooth falloff
        float core = smoothstep(0.5, 0.0, dist);
        float glow = smoothstep(0.5, 0.15, dist) * 0.5;
        float alpha = (core * 0.95 + glow) * vTwinkle;
        gl_FragColor = vec4(vColor * (core + 0.4), alpha);
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


// NEBULA LAYER
// ═══════════════════════════════════════════════════════════
function createNebula() {
  const nebulaGeo = new THREE.SphereGeometry(120, 64, 64);
  nebulaUniforms = {
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(0x2a0844) }, // rich purple
    uColor2: { value: new THREE.Color(0x0c3a3a) }, // deep teal
    uColor3: { value: new THREE.Color(0x3a2510) }, // warm amber
  };

  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: nebulaUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      varying vec2 vUv;
      varying vec3 vPosition;

      // Simplex-like noise (hash-based)
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = vUv + uTime * 0.002;
        float n1 = fbm(uv * 3.0);
        float n2 = fbm(uv * 3.0 + vec2(5.2, 1.3));
        float n3 = fbm(uv * 3.0 + vec2(9.7, 4.1));

        vec3 color = mix(uColor1, uColor2, n1);
        color = mix(color, uColor3, n2 * 0.5);

        float alpha = n3 * 0.18;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebula.renderOrder = -2;
  scene.add(nebula);
}

// ═══════════════════════════════════════════════════════════
// MILKY WAY BAND
// ═══════════════════════════════════════════════════════════
function createMilkyWay() {
  const count = 2000;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribute along a tilted great circle (galactic plane ~60° tilt)
    const t = (i / count) * Math.PI * 2;
    const spread = (Math.random() - 0.5) * 15; // spread around the band
    const spreadY = (Math.random() - 0.5) * 8;

    const radius = 95 + Math.random() * 10;
    const x = Math.cos(t) * radius + spread;
    const y = Math.sin(t) * radius * 0.3 + spreadY; // flatten
    const z = Math.sin(t) * radius * 0.8 + spread * 0.5;

    // Rotate the band 60 degrees
    const angle = Math.PI / 3;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y * Math.cos(angle) - z * Math.sin(angle);
    positions[i * 3 + 2] = y * Math.sin(angle) + z * Math.cos(angle);

    sizes[i] = 0.3 + Math.random() * 0.7;
    opacities[i] = 0.03 + Math.random() * 0.08;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const ctx = cv.getContext('2d');
  ctx.beginPath();
  ctx.arc(8, 8, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const circleTex = new THREE.CanvasTexture(cv);

  const mat = new THREE.PointsMaterial({
    color: 0x9999bb,
    size: 0.6,
    transparent: true,
    opacity: 0.12,
    sizeAttenuation: true,
    depthWrite: false,
    map: circleTex,
  });

  const milkyWay = new THREE.Points(geo, mat);
  milkyWay.renderOrder = -1;
  // Phase 12/Sprint C: Align to the real galactic plane (tilt ~63 deg, longitude offset ~123 deg)
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
  const phases = new Float32Array(STAR_COUNT); // for twinkling

  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = starPositions[i].x;
    positions[i * 3 + 1] = starPositions[i].y;
    positions[i * 3 + 2] = starPositions[i].z;

    colors[i * 3] = EMPTY_STAR_COLOR.r;
    colors[i * 3 + 1] = EMPTY_STAR_COLOR.g;
    colors[i * 3 + 2] = EMPTY_STAR_COLOR.b;

    sizes[i] = EMPTY_STAR_SIZE;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uHoveredIndex: { value: -1 },
    },
    vertexShader: `
      attribute float size;
      attribute float phase;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uHoveredIndex;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;

        // Twinkling — more pronounced for empty stars
        float twinkle = 0.7 + 0.3 * sin(uTime * 1.2 + phase * 6.28);

        // Hover pulse
        float pulseSize = size;
        float idx = float(gl_VertexID);
        if (abs(idx - uHoveredIndex) < 0.5) {
          float pulse = 1.0 + 0.4 * sin(uTime * 4.0);
          pulseSize *= pulse;
          twinkle = 1.0;
        }

        // Empty stars (size <= 4.0) get a softer but visible alpha
        vAlpha = twinkle * (size > 4.0 ? 1.0 : 0.55);

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pulseSize * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));

        // Soft glow falloff
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        float core = 1.0 - smoothstep(0.0, 0.15, dist);

        vec3 color = vColor * glow + vec3(1.0) * core * 0.3;
        float alpha = vAlpha * glow;

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
function addCorona(starIndex, colorHex) {
  const position = starPositions[starIndex];

  // Create soft circular glow texture for corona
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const coronaTex = new THREE.CanvasTexture(cv);

  const spriteMat = new THREE.SpriteMaterial({
    map: coronaTex,
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(position);
  sprite.scale.set(6, 6, 1);
  sprite.userData = { createdAt: Date.now(), starIndex };
  scene.add(sprite);
  coronaSprites.push(sprite);
}

function updateCoronas() {
  const now = Date.now();
  for (let i = coronaSprites.length - 1; i >= 0; i--) {
    const sprite = coronaSprites[i];
    const elapsed = now - sprite.userData.createdAt;
    if (elapsed > CORONA_DURATION_MS) {
      scene.remove(sprite);
      coronaSprites.splice(i, 1);
    } else {
      const fade = 1 - (elapsed / CORONA_DURATION_MS);
      sprite.material.opacity = 0.4 * fade;
      sprite.scale.setScalar(6 + (1 - fade) * 2);
    }
  }
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

  lightEchoGroup.userData.geo.attributes.position.needsUpdate = true;
  lightEchoGroup.userData.mat.opacity = opacity;
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
  
  function cosineSimilarity(A, B) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < A.length; i++) {
      dot += A[i] * B[i];
      normA += A[i] * A[i];
      normB += B[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Pairwise comparison
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const e1 = entries[i];
      const e2 = entries[j];
      if (e1.embedding && e2.embedding) {
        const sim = cosineSimilarity(e1.embedding, e2.embedding);
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

    const color = new THREE.Color(entry.star_color_hex);

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

    // Size scales with text length (capped)
    const textLen = Math.min(entry.text.length, 2000);
    sizesArr[idx] = WRITTEN_STAR_BASE_SIZE + (textLen / 500) * 3;

    starData[idx] = entry;

    // Corona for entries less than 24 hours old
    if (Date.now() - entryTime < CORONA_DURATION_MS) {
      addCorona(idx, entry.star_color_hex);
    }

    // Phase 8: Gravitational Well for crisis entries
    const valence = entry.valence || 0;
    const arousal = entry.arousal || 0;
    if (valence < -0.3 && arousal > 0.6) {
      const wellIntensity = Math.min(1.0, (-valence + arousal) / 2);
      createGravityWell(idx, wellIntensity);
    }
  }

  // Phase 11: Semantic Filaments
  computeFilaments(entries);

  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;

  // Draw constellations (no animation on load)
  drawConstellations(constellations, false);

  // Update entry count
  updateCalendarInfo();
}

// ═══════════════════════════════════════════════════════════
// AUDIO ENGINE (Web Audio API)
// ═══════════════════════════════════════════════════════════
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playStarTone(temperatureK) {
  if (!soundEnabled || !audioCtx) return;

  // Map temperature to frequency: 3000K → 110Hz, 30000K → 880Hz (logarithmic)
  const minTemp = 3000;
  const maxTemp = 30000;
  const minFreq = 110;
  const maxFreq = 880;
  const t = Math.log(temperatureK / minTemp) / Math.log(maxTemp / minTemp);
  const freq = minFreq * Math.pow(maxFreq / minFreq, Math.max(0, Math.min(1, t)));

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 2.0);
}

function playTypewriterClick() {
  if (!soundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.05);
}

function playConstellationChime() {
  if (!soundEnabled || !audioCtx) return;
  const fundamental = 440;
  [1, 5/4, 3/2].forEach((ratio, i) => {
    setTimeout(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * ratio, audioCtx.currentTime);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.0);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 3.0);
    }, i * 300);
  });
}

// Ambient drone
let ambientOscs = [];
function startAmbient() {
  if (!audioCtx) return;
  const freqs = [55, 82.5, 110];
  freqs.forEach(freq => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    ambientOscs.push({ osc, gain });
  });
}

function stopAmbient() {
  ambientOscs.forEach(({ osc, gain }) => {
    gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 1);
    osc.stop(audioCtx.currentTime + 1);
  });
  ambientOscs = [];
}

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
  playConstellationChime();
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

    // Check planets
    if (!foundReal) {
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
  const intersects = raycaster.intersectObject(starPoints);

  if (intersects.length > 0) {
    const idx = intersects[0].index;
    const entry = starData[idx];

    // Smooth fly-to the star
    if (starPositions[idx]) {
      flyToStar(starPositions[idx]);
    }

    if (entry) {
      // Delay overlay open until fly-to is partially complete
      setTimeout(() => openEntryOverlay(entry), 600);
    } else {
      setTimeout(() => openWritePanel(idx + 1), 600);
    }
  }
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
  playStarTone(entry.star_temperature_k);

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

  // Update star visual
  const idx = dayOfYear - 1;
  const color = new THREE.Color(entry.star_color_hex);
  const colorsArr = starPoints.geometry.attributes.color.array;
  const sizesArr = starPoints.geometry.attributes.size.array;

  colorsArr[idx * 3] = color.r;
  colorsArr[idx * 3 + 1] = color.g;
  colorsArr[idx * 3 + 2] = color.b;
  sizesArr[idx] = WRITTEN_STAR_BASE_SIZE + Math.min(text.length, 2000) / 500 * 3;

  starPoints.geometry.attributes.color.needsUpdate = true;
  starPoints.geometry.attributes.size.needsUpdate = true;

  starData[idx] = entry;

  // Add corona
  addCorona(idx, entry.star_color_hex);

  // Play star tone
  playStarTone(entry.star_temperature_k);

  // Reload constellations
  entries = await window.journal.getAllEntries(currentYear);
  const newConstellations = await window.journal.getConstellations(currentYear);
  const hadPreviousConstellations = constellations.length;
  constellations = newConstellations;
  drawConstellations(constellations, constellations.length > hadPreviousConstellations);

  if (constellations.length > hadPreviousConstellations) {
    playConstellationChime();
  }

  closeWritePanel();
  updateCalendarInfo();
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

  // Orbit drag controls
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !isWritePanelOpen && !isOverlayOpen) {
      isDragging = true;
      previousMousePos = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = 'grabbing';
    }
  });
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - previousMousePos.x;
    const dy = e.clientY - previousMousePos.y;
    spherical.theta -= dx * 0.005;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy * 0.005));
    previousMousePos = { x: e.clientX, y: e.clientY };
    updateCameraFromSpherical();
  });
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      renderer.domElement.style.cursor = 'default';
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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
      playTypewriterClick();
    }
  });

  // Entry overlay
  document.getElementById('entry-overlay-backdrop').addEventListener('click', closeEntryOverlay);
  document.getElementById('entry-close-btn').addEventListener('click', closeEntryOverlay);

  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => window.journal.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.journal.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.journal.close());

  // Sound toggle
  document.getElementById('btn-sound-toggle').addEventListener('click', () => {
    initAudio();
    soundEnabled = !soundEnabled;
    document.getElementById('btn-sound-toggle').textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) {
      startAmbient();
    } else {
      stopAmbient();
    }
  });

  // Constellation lines toggle
  const constBtn = document.getElementById('btn-constellations-toggle');
  if (constBtn) {
    constBtn.style.opacity = '0.5';
    constBtn.addEventListener('click', toggleRealConstellations);
  }

  // Mouse wheel zoom
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    spherical.radius = Math.max(40, Math.min(120, spherical.radius + e.deltaY * 0.05));
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
  });

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
}

function liveSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  if (!query) {
    renderSearchResults(entries);
    return;
  }
  const filtered = entries.filter(e =>
    (e.text && e.text.toLowerCase().includes(query)) ||
    (e.star_name && e.star_name.toLowerCase().includes(query)) ||
    (e.emotion_label && e.emotion_label.toLowerCase().includes(query))
  );
  renderSearchResults(filtered);
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

  // Update fly-to animation
  updateFlyTo(dt);

  // Update shader uniforms
  starPoints.material.uniforms.uTime.value = elapsed;
  if (nebulaUniforms) {
    nebulaUniforms.uTime.value = elapsed;
  }
  // Update real star twinkle
  if (window._bgStars && window._bgStars.userData.material) {
    window._bgStars.userData.material.uniforms.uTime.value = elapsed;
  }

  // Slow auto-rotation (only when not dragging or flying)
  if (window._autoRotate && !isDragging && !targetSpherical) {
    spherical.theta += 0.00001;
    updateCameraFromSpherical();
  }

  // Calendar ring follows sphere rotation slightly
  if (calendarRing) {
    calendarRing.rotation.z = elapsed * 0.00005;
  }

  // Ambient brightness based on time — very subtle twilight shift
  const now = new Date();
  const hour = now.getHours();
  let ambientBrightness = 0.0;
  if (hour >= 6 && hour < 18) {
    ambientBrightness = 0.012 * Math.sin(((hour - 6) / 12) * Math.PI);
  }
  scene.background.setRGB(
    0.004 + ambientBrightness * 0.08,
    0.004 + ambientBrightness * 0.10,
    0.016 + ambientBrightness * 0.15
  );

  // Update coronas + light echo + gravity wells
  updateCoronas();
  updateLightEcho();
  updateGravityWells(elapsed);

  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
init().catch(console.error);
