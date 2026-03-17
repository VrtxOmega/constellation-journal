// ═══════════════════════════════════════════════════════════
// CELESTIAL RENDERER — Three.js Visualization Layer
// Constellation Journal: Near-Earth Celestial Tracker
// ═══════════════════════════════════════════════════════════
// Renders: planets, Moon, Sun, NEOs, ISS, threat halos,
//          orbital paths, solar weather overlays
// Integrates with existing Three.js scene (added to app.js scene)
// ═══════════════════════════════════════════════════════════

const CelestialRenderer = (() => {
  'use strict';

  const SPHERE_RADIUS = 52; // slightly outside journal star sphere (50)
  const NEO_RADIUS = 51;    // between journal and planets
  const ISS_RADIUS = 48;    // inside journal sphere (closer to camera)

  // ── State ──
  let scene = null;
  let camera = null;
  let celestialGroup = null; // parent group for all celestial objects
  let planetSprites = {};
  let planetLabels = {};
  let neoPoints = null;
  let neoData = [];
  let issSprite = null;
  let issTrail = null;
  let issTrailPositions = [];
  let threatHalos = [];
  let solarOverlay = null;
  let enabled = false;
  let elapsedTime = 0;

  // ═══════════════════════════════════════════════════════════
  // SPRITE TEXTURE GENERATION (canvas-based, no external files)
  // ═══════════════════════════════════════════════════════════

  function createGlowTexture(size, color, glowIntensity) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;
    const r = size / 2;

    // Outer glow
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, r);
    const c = new THREE.Color(color);
    gradient.addColorStop(0, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},${glowIntensity})`);
    gradient.addColorStop(0.15, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},${glowIntensity * 0.7})`);
    gradient.addColorStop(0.4, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},${glowIntensity * 0.2})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Bright center
    const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, r * 0.15);
    coreGrad.addColorStop(0, `rgba(255,255,255,${glowIntensity})`);
    coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // NEO texture — irregular rocky asteroid with stardust
  function createNEOTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;

    // Subtle stardust haze behind the asteroid
    const dustGrad = ctx.createRadialGradient(center, center, 0, center, center, center * 0.9);
    dustGrad.addColorStop(0, 'rgba(180,140,80,0.08)');
    dustGrad.addColorStop(0.5, 'rgba(150,120,60,0.04)');
    dustGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dustGrad;
    ctx.fillRect(0, 0, size, size);

    // Scattered dust particles around asteroid
    const rng = (seed) => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    };
    const rand = rng(42);
    for (let i = 0; i < 12; i++) {
      const dx = (rand() - 0.5) * size * 0.7;
      const dy = (rand() - 0.5) * size * 0.7;
      const r = 0.3 + rand() * 0.8;
      const alpha = 0.15 + rand() * 0.25;
      ctx.beginPath();
      ctx.arc(center + dx, center + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,170,100,${alpha})`;
      ctx.fill();
    }

    // Irregular rocky asteroid core
    ctx.beginPath();
    const vertices = 8;
    const baseR = size * 0.12;
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * Math.PI * 2;
      const jitter = baseR * (0.6 + rand() * 0.8); // irregular surface
      const x = center + Math.cos(angle) * jitter;
      const y = center + Math.sin(angle) * jitter;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Rock fill with noise-like gradient
    const rockGrad = ctx.createRadialGradient(center - 1, center - 1, 0, center, center, baseR);
    rockGrad.addColorStop(0, 'rgba(220,190,130,0.9)');
    rockGrad.addColorStop(0.5, 'rgba(180,150,90,0.8)');
    rockGrad.addColorStop(1, 'rgba(140,110,60,0.6)');
    ctx.fillStyle = rockGrad;
    ctx.fill();

    // Tiny bright highlight (sunlit edge)
    ctx.beginPath();
    ctx.arc(center - baseR * 0.3, center - baseR * 0.3, baseR * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.3)';
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ISS texture (bright white cross)
  function createISSTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;

    // Glow
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(200,220,255,0.7)');
    gradient.addColorStop(0.5, 'rgba(150,180,255,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Cross
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center - size * 0.3, center); ctx.lineTo(center + size * 0.3, center);
    ctx.moveTo(center, center - size * 0.15); ctx.lineTo(center, center + size * 0.15);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init(threeScene, threeCamera) {
    scene = threeScene;
    camera = threeCamera;
    enabled = true;

    celestialGroup = new THREE.Group();
    celestialGroup.name = 'celestialTracker';
    scene.add(celestialGroup);

    createPlanetSprites();
    createNEOLayer();
    createISSLayer();
    createSolarOverlay();
    createDeepSkyObjects();
    createMeteorShowers();
  }

  function destroy() {
    enabled = false;
    if (celestialGroup && scene) {
      scene.remove(celestialGroup);
      // Dispose geometries and materials
      celestialGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    celestialGroup = null;
    planetSprites = {};
    neoPoints = null;
    issSprite = null;
    issTrail = null;
    threatHalos = [];
  }

  // ═══════════════════════════════════════════════════════════
  // PLANET SPRITES
  // ═══════════════════════════════════════════════════════════

  const PLANET_TEXTURES = {
    jupiter: 'textures/jupiter.jpg',
    saturn: 'textures/saturn.jpg',
    mars: 'textures/mars.jpg',
    moon: 'textures/moon.jpg',
    sun: 'textures/sun.jpg',
    venus: 'textures/venus.jpg',
    neptune: 'textures/neptune.jpg',
    uranus: 'textures/uranus.jpg',
    earth: 'textures/earth.jpg',
    mercury: 'textures/moon.jpg',
    pluto: 'textures/pluto.jpg',
  };

  function createPlanetSprites() {
    if (!window.OrbitalMechanics) return;
    const visuals = window.OrbitalMechanics.PLANET_VISUALS;
    const loader = new THREE.TextureLoader();

    for (const [name, vis] of Object.entries(visuals)) {
      const group = new THREE.Group();
      group.userData = { type: 'planet', name: name, label: vis.label };

      // ── Glow halo sprite (AdditiveBlending glow envelope) ──
      const haloTex = createPlanetHaloTexture(256, vis.color, vis.glow);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.35
      });
      const haloSprite = new THREE.Sprite(haloMat);
      haloSprite.scale.set(vis.size * 1.6, vis.size * 1.6, 1);
      group.add(haloSprite);

      // ── 3D Sphere mesh with real photographic texture ──
      const sphereRadius = vis.size * 0.28;
      const segments = name === 'sun' ? 48 : 32;
      const geometry = new THREE.SphereGeometry(sphereRadius, segments, segments);

      const meshMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(vis.color),
        transparent: false,
        depthWrite: true,
      });
      const mesh = new THREE.Mesh(geometry, meshMat);

      // Load real photographic texture
      const texPath = PLANET_TEXTURES[name];
      if (texPath) {
        loader.load(texPath, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          meshMat.map = tex;
          meshMat.color.set(0xffffff);
          meshMat.needsUpdate = true;
        });
      }
      mesh.renderOrder = 2;
      group.add(mesh);

      // ── Saturn ring — separate RingGeometry ──
      if (name === 'saturn') {
        const innerR = sphereRadius * 1.25;
        const outerR = sphereRadius * 2.2;
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 64);
        // Fix UVs for radial mapping
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const dist = Math.sqrt(x * x + y * y);
          uv.setXY(i, (dist - innerR) / (outerR - innerR), 0.5);
        }

        // Ring texture — opaque banded gradient (transparency handled by material)
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 512; ringCanvas.height = 1;
        const rctx = ringCanvas.getContext('2d');
        const ringGrad = rctx.createLinearGradient(0, 0, 512, 0);
        // Use solid colors — Cassini Division is the only dark gap
        ringGrad.addColorStop(0,    'rgb(80,70,55)');      // C ring inner (dim)
        ringGrad.addColorStop(0.15, 'rgb(160,145,120)');    // C ring
        ringGrad.addColorStop(0.28, 'rgb(195,180,150)');    // B ring inner
        ringGrad.addColorStop(0.35, 'rgb(30,25,20)');       // Cassini Division (dark gap)
        ringGrad.addColorStop(0.38, 'rgb(30,25,20)');       // Cassini Division
        ringGrad.addColorStop(0.42, 'rgb(210,195,160)');    // A ring inner
        ringGrad.addColorStop(0.65, 'rgb(200,185,150)');    // A ring
        ringGrad.addColorStop(0.78, 'rgb(180,165,135)');    // A ring fading
        ringGrad.addColorStop(0.85, 'rgb(60,55,45)');       // Encke gap
        ringGrad.addColorStop(0.88, 'rgb(150,138,110)');    // A ring outer
        ringGrad.addColorStop(1,    'rgb(40,35,28)');       // Outer edge fade
        rctx.fillStyle = ringGrad;
        rctx.fillRect(0, 0, 512, 1);

        const ringTex = new THREE.CanvasTexture(ringCanvas);
        ringTex.needsUpdate = true;
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          opacity: 0.85
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        // Tilt ring for visibility — ~75° toward camera
        ringMesh.rotation.x = Math.PI * 0.42;
        ringMesh.renderOrder = 3;
        group.add(ringMesh);
      }

      group.visible = false;
      group._halo = haloSprite;
      group._disc = mesh;       // compatibility with existing code
      group._mesh = mesh;
      group._baseSize = vis.size;
      celestialGroup.add(group);
      planetSprites[name] = group;
    }
  }

  // ── HALO TEXTURE: pure radial glow, no body ──
  function createPlanetHaloTexture(size, color, glowIntensity) {
    const s = size * 2;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d');
    const center = s / 2;
    const c = new THREE.Color(color);
    const cr = Math.floor(c.r * 255);
    const cg = Math.floor(c.g * 255);
    const cb = Math.floor(c.b * 255);

    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${glowIntensity * 0.9})`);
    grad.addColorStop(0.15, `rgba(${cr},${cg},${cb},${glowIntensity * 0.5})`);
    grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${glowIntensity * 0.15})`);
    grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},${glowIntensity * 0.03})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ═══════════════════════════════════════════════════════════
  // DEEP SKY OBJECTS — famous nebulae, galaxies, clusters
  // ═══════════════════════════════════════════════════════════

  const DEEP_SKY_OBJECTS = [
    { id: 'M42',  name: 'Orion Nebula',      ra: 5.588,  dec: -5.39,  mag: 4.0, color: 0xFF6B8A, type: 'nebula',  size: 3.5, desc: 'Stellar nursery 1,344 ly away' },
    { id: 'M31',  name: 'Andromeda Galaxy',   ra: 0.712,  dec: 41.27,  mag: 3.4, color: 0xE8D5A0, type: 'galaxy',  size: 4.0, desc: 'Nearest large galaxy, 2.5M ly' },
    { id: 'M45',  name: 'Pleiades',           ra: 3.791,  dec: 24.11,  mag: 1.6, color: 0x88BBFF, type: 'cluster', size: 3.0, desc: 'Seven Sisters open cluster, 444 ly' },
    { id: 'M1',   name: 'Crab Nebula',        ra: 5.575,  dec: 22.01,  mag: 8.4, color: 0xFF8844, type: 'nebula',  size: 2.0, desc: 'Supernova remnant from 1054 AD' },
    { id: 'M57',  name: 'Ring Nebula',         ra: 18.893, dec: 33.03,  mag: 8.8, color: 0x66DDAA, type: 'nebula',  size: 1.8, desc: 'Planetary nebula in Lyra' },
    { id: 'M104', name: 'Sombrero Galaxy',     ra: 12.666, dec: -11.62, mag: 8.0, color: 0xDDCC88, type: 'galaxy',  size: 2.2, desc: 'Edge-on galaxy with dust lane' },
    { id: 'NGC5139', name: 'Omega Centauri',   ra: 13.447, dec: -47.48, mag: 3.7, color: 0xFFEEAA, type: 'cluster', size: 3.0, desc: 'Largest globular cluster, 10M stars' },
    { id: 'M16',  name: 'Eagle Nebula',        ra: 18.314, dec: -13.79, mag: 6.0, color: 0xCC7755, type: 'nebula',  size: 2.5, desc: 'Pillars of Creation, 7,000 ly' },
    { id: 'M8',   name: 'Lagoon Nebula',       ra: 18.063, dec: -24.38, mag: 6.0, color: 0xFF5577, type: 'nebula',  size: 2.8, desc: 'Giant interstellar cloud in Sagittarius' },
    { id: 'B33',  name: 'Horsehead Nebula',    ra: 5.682,  dec: -2.46,  mag: 11,  color: 0xBB4444, type: 'nebula',  size: 1.5, desc: 'Dark nebula silhouette in Orion' },
    { id: 'M51',  name: 'Whirlpool Galaxy',    ra: 13.498, dec: 47.20,  mag: 8.4, color: 0xCCBB99, type: 'galaxy',  size: 2.0, desc: 'Face-on spiral galaxy, 23M ly' },
    { id: 'M33',  name: 'Triangulum Galaxy',   ra: 1.564,  dec: 30.66,  mag: 5.7, color: 0xBBCCDD, type: 'galaxy',  size: 2.5, desc: 'Third-largest in Local Group' },
  ];

  let deepSkySprites = [];

  function createDeepSkyObjects() {
    if (!window.OrbitalMechanics) return;

    for (const dso of DEEP_SKY_OBJECTS) {
      const pos = window.OrbitalMechanics.raDec2Cartesian(dso.ra, dso.dec, SPHERE_RADIUS - 0.5);

      // Create glow texture
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const center = 32;
      const c = new THREE.Color(dso.color);
      const cr = Math.floor(c.r * 255);
      const cg = Math.floor(c.g * 255);
      const cb = Math.floor(c.b * 255);

      // Nebulae: diffuse fuzzy glow. Galaxies: tighter oval. Clusters: scattered dots.
      if (dso.type === 'nebula') {
        const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.5)`);
        grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.2)`);
        grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.05)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
      } else if (dso.type === 'galaxy') {
        ctx.save();
        ctx.translate(center, center);
        ctx.scale(1, 0.6); // elliptical
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, center);
        grad.addColorStop(0, `rgba(${Math.min(255,cr+40)},${Math.min(255,cg+30)},${Math.min(255,cb+20)},0.6)`);
        grad.addColorStop(0.2, `rgba(${cr},${cg},${cb},0.3)`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.08)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-center, -center * 2, 64, 64 * 2);
        ctx.restore();
      } else { // cluster
        const grad = ctx.createRadialGradient(center, center, 0, center, center, center * 0.7);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.4)`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.15)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        // Scatter stars
        for (let i = 0; i < 15; i++) {
          const sx = center + (Math.random() - 0.5) * 30;
          const sy = center + (Math.random() - 0.5) * 30;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.5 + Math.random(), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.3 + Math.random() * 0.4})`;
          ctx.fill();
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.scale.set(dso.size, dso.size, 1);
      sprite.userData = {
        type: 'dso',
        id: dso.id,
        name: dso.name,
        dsoType: dso.type,
        magnitude: dso.mag,
        description: dso.desc,
      };

      celestialGroup.add(sprite);
      deepSkySprites.push(sprite);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // METEOR SHOWERS — radiant markers with peak date visibility
  // Single source of truth: MeteorShowers.SHOWERS (meteor-showers.js)
  // ═══════════════════════════════════════════════════════════

  let meteorSprites = [];

  function createMeteorShowers() {
    if (!window.OrbitalMechanics || !window.MeteorShowers) return;

    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

    for (const shower of window.MeteorShowers.SHOWERS) {
      const peakDOY = window.MeteorShowers.dateToDOY(shower.peak);

      let dayDiff = Math.abs(dayOfYear - peakDOY);
      if (dayDiff > 182) dayDiff = 365 - dayDiff;
      if (dayDiff > 30) continue;

      const opacity = Math.max(0.15, 1 - dayDiff / 30) * 0.6;
      const pos = window.OrbitalMechanics.raDec2Cartesian(shower.radiant.ra, shower.radiant.dec, SPHERE_RADIUS - 0.3);

      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const center = 32;

      // Use shower-specific color from catalog
      const showerColor = new THREE.Color(shower.color || 0x78DCC8);
      const cr = Math.floor(showerColor.r * 255);
      const cg = Math.floor(showerColor.g * 255);
      const cb = Math.floor(showerColor.b * 255);

      const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.7)`);
      grad.addColorStop(0.15, `rgba(${cr},${cg},${cb},0.4)`);
      grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.1)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center, center - 20); ctx.lineTo(center, center + 20);
      ctx.moveTo(center - 20, center); ctx.lineTo(center + 20, center);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;

      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.position.set(pos.x, pos.y, pos.z);
      const isNearPeak = dayDiff < 7;
      sprite.scale.set(isNearPeak ? 4 : 2.5, isNearPeak ? 4 : 2.5, 1);
      sprite.userData = {
        type: 'meteor',
        name: shower.name,
        peakDate: `${shower.peak.month}/${shower.peak.day}`,
        zhr: shower.zhr,
        parent: shower.parent,
        isNearPeak: isNearPeak,
      };

      celestialGroup.add(sprite);
      meteorSprites.push(sprite);
    }
  }


  function updatePlanets(planetData) {
    if (!planetData || !window.OrbitalMechanics) return;

    for (const p of planetData) {
      const sprite = planetSprites[p.name];
      if (!sprite) continue;

      // Base radius with distance-based depth offset to prevent overlap
      // Closer planets sit nearer, farther planets pushed outward
      let r;
      if (p.name === 'sun') {
        r = SPHERE_RADIUS + 4;
      } else if (p.name === 'moon') {
        r = SPHERE_RADIUS - 2;
      } else {
        // Use log of distance (AU) to spread planets apart
        // Inner planets (~0.5-2 AU) → offset ~0, outer planets (~10-30 AU) → offset ~5
        const distAU = p.dist || 1;
        const depthOffset = Math.log10(Math.max(1, distAU)) * 3.5;
        r = SPHERE_RADIUS + depthOffset;
      }
      const pos = window.OrbitalMechanics.raDec2Cartesian(p.ra, p.dec, r);
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.visible = true;

      // Store data for tooltip
      sprite.userData.ra = p.ra;
      sprite.userData.dec = p.dec;
      sprite.userData.dist = p.dist;
      if (p.illumination !== undefined) sprite.userData.illumination = p.illumination;

      // ── Moon phase shadow ──
      if (p.name === 'moon' && p.illumination !== undefined) {
        // Create or update phase shadow overlay
        if (!sprite._phaseShadow) {
          const shadowCanvas = document.createElement('canvas');
          shadowCanvas.width = 128; shadowCanvas.height = 128;
          const shadowTex = new THREE.CanvasTexture(shadowCanvas);
          const shadowMat = new THREE.SpriteMaterial({
            map: shadowTex,
            transparent: true,
            depthWrite: false,
            opacity: 0.85,
          });
          const shadowSprite = new THREE.Sprite(shadowMat);
          shadowSprite.renderOrder = 4;
          sprite.add(shadowSprite);
          sprite._phaseShadow = shadowSprite;
          sprite._phaseCanvas = shadowCanvas;
        }
        // Draw phase shadow — illumination 0=new moon, 1=full moon
        const illum = p.illumination / 100; // convert from percentage
        const pc = sprite._phaseCanvas;
        const pctx = pc.getContext('2d');
        const s = pc.width;
        const center = s / 2;
        pctx.clearRect(0, 0, s, s);

        if (illum < 0.98) {
          // Draw shadow circle then cut out lit portion
          pctx.save();
          // Clip to circle
          pctx.beginPath();
          pctx.arc(center, center, center - 2, 0, Math.PI * 2);
          pctx.clip();

          // Fill all with shadow
          pctx.fillStyle = 'rgba(0,0,0,0.88)';
          pctx.fillRect(0, 0, s, s);

          // Cut out the lit crescent
          pctx.globalCompositeOperation = 'destination-out';
          pctx.beginPath();
          // The lit portion is an ellipse whose width depends on illumination
          // At illum=0.5, half-moon => flat line. At illum=1, full circle. At illum=0, nothing.
          const litW = Math.abs(illum * 2 - 1) * center;
          const litX = illum > 0.5 ? center - (1 - illum) * s : center + illum * s * 0.5;
          if (illum > 0.5) {
            // Waxing gibbous — illuminate most, shadow is crescent on right
            pctx.ellipse(center, center, center - 2, center - 2, 0, -Math.PI / 2, Math.PI / 2);
            pctx.ellipse(center, center, litW, center - 2, 0, Math.PI / 2, -Math.PI / 2);
          } else {
            // Waxing crescent — shadow covers most, lit crescent on right
            pctx.ellipse(center, center, center - 2, center - 2, 0, -Math.PI / 2, Math.PI / 2);
            pctx.ellipse(center, center, litW, center - 2, 0, Math.PI / 2, -Math.PI / 2, true);
          }
          pctx.closePath();
          pctx.fill();
          pctx.restore();
        }

        sprite._phaseShadow.material.map.needsUpdate = true;
        // Scale shadow to match mesh
        const meshScale = sprite._disc ? sprite._disc.scale.x * 3.6 : 2;
        sprite._phaseShadow.scale.set(meshScale, meshScale, 1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NEO LAYER — BatchedPoints for performance
  // ═══════════════════════════════════════════════════════════

  function createNEOLayer() {
    // Pre-allocate for up to 30 NEOs (only show closest/most significant)
    const maxNEOs = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxNEOs * 3);
    const colors = new Float32Array(maxNEOs * 3);
    const sizes = new Float32Array(maxNEOs);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setDrawRange(0, 0);

    const material = new THREE.PointsMaterial({
      size: 2.5,
      map: createNEOTexture(64),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true
    });

    neoPoints = new THREE.Points(geometry, material);
    neoPoints.name = 'neoPoints';
    celestialGroup.add(neoPoints);
  }

  function updateNEOs(neos) {
    if (!neoPoints || !neos || !window.OrbitalMechanics) return;
    neoData = neos;

    const positions = neoPoints.geometry.attributes.position.array;
    const colors = neoPoints.geometry.attributes.color.array;
    const count = Math.min(neos.length, 30);

    for (let i = 0; i < count; i++) {
      const neo = neos[i];

      // Distribute NEOs around sphere based on hash of name
      // (We don't have precise RA/Dec from NeoWs, so distribute by hash)
      const hash = hashString(neo.name || neo.id);
      const ra = (hash % 2400) / 100; // 0-24 hours
      const dec = ((hash >> 8) % 1800) / 10 - 90; // -90 to +90

      const pos = window.OrbitalMechanics.raDec2Cartesian(ra, dec, NEO_RADIUS);
      positions[i * 3]     = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      // Color by distance: gold (>1 LD), orange (<1 LD), red (<0.5 LD)
      const lunarDist = neo.missDistanceLunar;
      let r, g, b;
      if (lunarDist > 5) {
        r = 0.9; g = 0.8; b = 0.3; // gold
      } else if (lunarDist > 1) {
        r = 1.0; g = 0.6; b = 0.1; // orange
      } else if (lunarDist > 0.5) {
        r = 1.0; g = 0.3; b = 0.0; // orange-red
      } else {
        r = 1.0; g = 0.1; b = 0.1; // red
      }

      if (neo.isPotentiallyHazardous) {
        r = Math.min(1, r + 0.2);
        g *= 0.5;
        b *= 0.3;
      }

      colors[i * 3]     = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    neoPoints.geometry.attributes.position.needsUpdate = true;
    neoPoints.geometry.attributes.color.needsUpdate = true;
    neoPoints.geometry.setDrawRange(0, count);
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ═══════════════════════════════════════════════════════════
  // ISS LAYER
  // ═══════════════════════════════════════════════════════════

  function createISSLayer() {
    const texture = createISSTexture(64);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    issSprite = new THREE.Sprite(material);
    issSprite.scale.set(4, 4, 1);
    issSprite.visible = false;
    issSprite.userData = { type: 'iss', label: 'ISS' };
    celestialGroup.add(issSprite);

    // Trail line
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(90 * 3); // 90 points (90 min at 1/min)
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);

    const trailMat = new THREE.LineBasicMaterial({
      color: 0x88AAFF,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    issTrail = new THREE.Line(trailGeo, trailMat);
    celestialGroup.add(issTrail);
  }

  function updateISS(issData) {
    if (!issSprite || !issData || !window.OrbitalMechanics) return;

    const pos = window.OrbitalMechanics.raDec2Cartesian(issData.ra, issData.dec, ISS_RADIUS);
    issSprite.position.set(pos.x, pos.y, pos.z);
    issSprite.visible = true;

    // Add to trail
    issTrailPositions.push({ x: pos.x, y: pos.y, z: pos.z });
    if (issTrailPositions.length > 90) issTrailPositions.shift();

    const trailArr = issTrail.geometry.attributes.position.array;
    for (let i = 0; i < issTrailPositions.length; i++) {
      trailArr[i * 3]     = issTrailPositions[i].x;
      trailArr[i * 3 + 1] = issTrailPositions[i].y;
      trailArr[i * 3 + 2] = issTrailPositions[i].z;
    }
    issTrail.geometry.attributes.position.needsUpdate = true;
    issTrail.geometry.setDrawRange(0, issTrailPositions.length);
  }

  // ═══════════════════════════════════════════════════════════
  // SENTRY THREAT HALOS
  // ═══════════════════════════════════════════════════════════

  function updateThreatHalos(sentryObjects) {
    if (!sentryObjects || !window.OrbitalMechanics) return;

    // Remove old halos
    for (const halo of threatHalos) {
      celestialGroup.remove(halo);
      if (halo.children) halo.children.forEach(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
      });
    }
    threatHalos = [];

    // Only display top 10 threats
    const top = sentryObjects.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
      const obj = top[i];

      // Position by hash of designation
      const hash = hashString(obj.designation || obj.name);
      const ra = (hash % 2400) / 100;
      const dec = ((hash >> 8) % 1800) / 10 - 90;
      const pos = window.OrbitalMechanics.raDec2Cartesian(ra, dec, SPHERE_RADIUS + 1);

      // Torino color
      let color;
      if (obj.torinoMax === 0) color = 0xBB9933;
      else if (obj.torinoMax <= 3) color = 0x44CC66;
      else if (obj.torinoMax <= 7) color = 0xFFAA00;
      else color = 0xFF3300;

      // Create stardust cloud group instead of ring
      const threatGroup = new THREE.Group();
      threatGroup.position.set(pos.x, pos.y, pos.z);

      // Central asteroid sprite — irregular shape
      const asteroidTex = createThreatAsteroidTexture(64, color);
      const asteroidMat = new THREE.SpriteMaterial({
        map: asteroidTex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const asteroidSprite = new THREE.Sprite(asteroidMat);
      const sizeScale = 1.2 + (obj.diameterKm || 0.1) * 0.5;
      asteroidSprite.scale.set(sizeScale, sizeScale, 1);
      threatGroup.add(asteroidSprite);

      // Stardust debris cloud — scattered small particles
      const dustCount = 8 + Math.floor(Math.random() * 6);
      const dustGeo = new THREE.BufferGeometry();
      const dustPositions = new Float32Array(dustCount * 3);
      for (let d = 0; d < dustCount; d++) {
        // Random scatter within 1.5 unit radius
        dustPositions[d * 3]     = (Math.random() - 0.5) * 3;
        dustPositions[d * 3 + 1] = (Math.random() - 0.5) * 3;
        dustPositions[d * 3 + 2] = (Math.random() - 0.5) * 1.5;
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

      const dustMat = new THREE.PointsMaterial({
        size: 0.15,
        transparent: true,
        opacity: 0.35,
        color: color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      });
      const dustCloud = new THREE.Points(dustGeo, dustMat);
      threatGroup.add(dustCloud);

      threatGroup.userData = {
        type: 'sentry',
        designation: obj.designation,
        name: obj.name,
        torino: obj.torinoMax,
        palermo: obj.palermoCum,
        impactProb: obj.impactProbability,
        diameter: obj.diameterKm
      };

      celestialGroup.add(threatGroup);
      threatHalos.push(threatGroup);
    }
  }

  // Threat asteroid texture — irregular rocky shape with debris
  function createThreatAsteroidTexture(size, color) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;
    const c = new THREE.Color(color);
    const cr = Math.floor(c.r * 255);
    const cg = Math.floor(c.g * 255);
    const cb = Math.floor(c.b * 255);

    // Soft outer glow
    const glowGrad = ctx.createRadialGradient(center, center, 0, center, center, center);
    glowGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.15)`);
    glowGrad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.05)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, size, size);

    // Irregular rocky shape
    ctx.beginPath();
    const vertices = 10;
    const baseR = size * 0.18;
    let seed = (cr * 17 + cg * 31 + cb * 53) % 10000;
    const pseudoRand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
    for (let v = 0; v < vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2;
      const jitter = baseR * (0.5 + pseudoRand() * 1.0);
      const x = center + Math.cos(angle) * jitter;
      const y = center + Math.sin(angle) * jitter;
      if (v === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const rockGrad = ctx.createRadialGradient(center - 2, center - 2, 0, center, center, baseR * 1.2);
    rockGrad.addColorStop(0, `rgba(${Math.min(255, cr + 60)},${Math.min(255, cg + 40)},${Math.min(255, cb + 20)},0.9)`);
    rockGrad.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.7)`);
    rockGrad.addColorStop(1, `rgba(${Math.floor(cr*0.5)},${Math.floor(cg*0.5)},${Math.floor(cb*0.5)},0.4)`);
    ctx.fillStyle = rockGrad;
    ctx.fill();

    // Sunlit highlight
    ctx.beginPath();
    ctx.arc(center - baseR * 0.25, center - baseR * 0.3, baseR * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,0.2)`;
    ctx.fill();

    // Micro-craters
    for (let cr2 = 0; cr2 < 3; cr2++) {
      const cx = center + (pseudoRand() - 0.5) * baseR;
      const cy = center + (pseudoRand() - 0.5) * baseR;
      ctx.beginPath();
      ctx.arc(cx, cy, pseudoRand() * 1.5 + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.1 + pseudoRand() * 0.15})`;
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ═══════════════════════════════════════════════════════════
  // SOLAR WEATHER OVERLAY
  // ═══════════════════════════════════════════════════════════

  function createSolarOverlay() {
    // Phase 4B: Multi-band aurora — 3 concentric torus rings
    // Creates a curtain effect mimicking real aurora borealis
    const auroraGroup = new THREE.Group();
    auroraGroup.name = 'aurora';

    const bands = [
      { radius: SPHERE_RADIUS - 1.5, tube: 0.25, color: 0x44FF88, phase: 0 },     // green (inner)
      { radius: SPHERE_RADIUS - 2.0, tube: 0.35, color: 0x44CCAA, phase: 1.0 },   // green-blue (mid)
      { radius: SPHERE_RADIUS - 2.8, tube: 0.2, color: 0x8844CC, phase: 2.0 }      // purple (outer)
    ];

    const auroraBands = [];
    for (const band of bands) {
      const geo = new THREE.TorusGeometry(band.radius, band.tube, 8, 96);
      const mat = new THREE.MeshBasicMaterial({
        color: band.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.userData = { baseColor: band.color, phase: band.phase, baseOpacity: 0 };
      auroraGroup.add(mesh);
      auroraBands.push(mesh);
    }

    celestialGroup.add(auroraGroup);
    solarOverlay = auroraGroup;
    solarOverlay._bands = auroraBands;
  }

  function updateSolarWeather(donkiData) {
    if (!solarOverlay || !solarOverlay._bands || !donkiData) return;

    const storms = donkiData.storms || [];
    const flares = donkiData.flares || [];
    const cmes = donkiData.cmes || [];

    // Aurora effect: visible during geomagnetic storms
    const maxKp = storms.reduce((max, s) => Math.max(max, s.kpIndex || 0), 0);
    const auroraIntensity = Math.min(1, maxKp / 9);

    // Phase 4B: Color palette by Kp level for each band
    const colorSets = {
      low:  [0x44FF88, 0x44CCAA, 0x8844CC],  // green / teal / purple
      mid:  [0x88FF44, 0xFF8844, 0xCC44AA],  // lime / orange / magenta
      high: [0xFF4444, 0xFF2222, 0xFF8888]   // red / crimson / pink
    };
    let colors;
    if (maxKp > 7)      colors = colorSets.high;
    else if (maxKp > 4) colors = colorSets.mid;
    else                colors = colorSets.low;

    for (let i = 0; i < solarOverlay._bands.length; i++) {
      const band = solarOverlay._bands[i];
      band.material.color.setHex(colors[i]);
      band.userData.baseOpacity = auroraIntensity * (0.25 + i * 0.05);
      band.material.opacity = band.userData.baseOpacity;
    }

    // Sun scale boost during flares — store on _baseSize for LOD loop
    const sunGroup = planetSprites['sun'];
    if (sunGroup) {
      let sunScale = 8;
      if (flares.length > 0) {
        const lastFlare = flares[flares.length - 1];
        if (lastFlare.classType && lastFlare.classType.startsWith('X')) {
          sunScale = 14;
        } else if (lastFlare.classType && lastFlare.classType.startsWith('M')) {
          sunScale = 11;
        } else {
          sunScale = 9;
        }
      }
      sunGroup._baseSize = sunScale;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ANIMATION UPDATE (called per frame)
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    if (!enabled || !celestialGroup) return;
    try {
    elapsedTime += dt;

    // ── LOD sliding scale: disc/halo independent control ──
    if (camera) {
      const camDist = camera.position.length();
      // t: 1.0 = far (dist 80+), 0.0 = close (dist 15)
      const t = Math.max(0, Math.min(1, (camDist - 15) / 65));

      // Lerp helper
      const lerp = (a, b, f) => a + (b - a) * f;

      for (const [name, group] of Object.entries(planetSprites)) {
        if (!group._disc || !group._halo) continue;
        const base = group._baseSize || 3;

        // Mesh sphere: uniform scale (3D)
        const meshScale = lerp(1.35, 0.55, t) * base;

        // Halo sprite: large & bright far, small & faint close
        const haloScale = lerp(1.15, 1.9, t) * base;
        const haloOpacity = lerp(0.10, 0.35, t);

        // For sphere mesh, scale uniformly (not 2D like sprites)
        const mScale = meshScale * 0.28 / (base * 0.28); // normalize to unit sphere
        group._disc.scale.set(mScale, mScale, mScale);

        // Saturn: wider for ring visibility
        if (name === 'saturn') {
          const saturnScale = lerp(1.6, 0.7, t) * base * 0.28 / (base * 0.28);
          group._disc.scale.set(saturnScale, saturnScale, saturnScale);
        }

        group._halo.scale.set(haloScale, haloScale, 1);
        group._halo.material.opacity = haloOpacity;

        // ── Planet rotation — each planet spins at its own rate ──
        const ROTATION_RATES = {
          mercury: 0.002, venus: -0.001, earth: 0.015, mars: 0.014,
          jupiter: 0.035, saturn: 0.030, uranus: -0.025, neptune: 0.028,
          pluto: 0.004, moon: 0.005, sun: 0.003
        };
        const rate = ROTATION_RATES[name] || 0.01;
        group._disc.rotation.y += rate * dt;
      }
    }

    // ── Subtle NEO pulse ──
    if (neoPoints && neoData.length > 0) {
      const pulse = 0.45 + Math.sin(elapsedTime * 1.5) * 0.15;
      neoPoints.material.opacity = pulse;
    }

    // ── Pulse threat asteroid clouds ──
    for (const halo of threatHalos) {
      const basePulse = 0.45 + Math.sin(elapsedTime * 1.5 + hashString(halo.userData.designation) * 0.01) * 0.1;
      // Pulse asteroid sprite (first child) and tumble dust cloud (second child)
      if (halo.children[0] && halo.children[0].material) {
        halo.children[0].material.opacity = basePulse + 0.25;
      }
      if (halo.children[1]) {
        halo.children[1].rotation.y += dt * 0.2;
        halo.children[1].rotation.x += dt * 0.1;
      }
    }

    // ── ISS blink ──
    if (issSprite && issSprite.visible) {
      const blink = 0.6 + Math.sin(elapsedTime * 6) * 0.4;
      issSprite.material.opacity = blink;
    }

    // ── Aurora shimmer — Phase 4B multi-band curtain ──
    if (solarOverlay && solarOverlay._bands) {
      for (let i = 0; i < solarOverlay._bands.length; i++) {
        const band = solarOverlay._bands[i];
        if (band.userData.baseOpacity <= 0) continue;

        // Independent shimmer per band
        const shimmer = 0.7 + 0.3 * Math.sin(elapsedTime * (1.2 + i * 0.5) + band.userData.phase);
        band.material.opacity = band.userData.baseOpacity * shimmer;

        // Slow rotation + vertical oscillation (curtain effect)
        band.rotation.z += dt * (0.03 + i * 0.02);
        band.position.y = Math.sin(elapsedTime * 0.5 + band.userData.phase) * 0.3;
      }
    }

    // Planets do NOT twinkle — they are resolved discs.
    // Only point sources (stars) scintillate through Earth's atmosphere.
    } catch (e) {
      console.warn('[CelestialRenderer] update error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FULL DATA UPDATE (called when tracker refreshes)
  // ═══════════════════════════════════════════════════════════

  function updateAll(tracker) {
    if (!enabled || !tracker) return;

    updatePlanets(tracker.getPlanets());
    updateNEOs(tracker.getNEOs());
    updateISS(tracker.getISS());
    updateThreatHalos(tracker.getSentry());
    updateSolarWeather(tracker.getDONKI());
  }

  // ═══════════════════════════════════════════════════════════
  // RAYCAST HIT TEST (for tooltip/click)
  // ═══════════════════════════════════════════════════════════

  function hitTest(raycaster) {
    if (!enabled || !celestialGroup) return null;

    // Check planet sprites (Groups with child sprites — use recursive)
    const groups = Object.values(planetSprites).filter(g => g.visible);
    const spriteHits = raycaster.intersectObjects(groups, true);
    if (spriteHits.length > 0) {
      // Walk parent chain to find Group with planet userData
      let obj = spriteHits[0].object;
      while (obj && !(obj.userData && obj.userData.type === 'planet')) obj = obj.parent;
      if (obj) {
        return {
          type: 'planet',
          data: obj.userData
        };
      }
    }

    // Check ISS
    if (issSprite && issSprite.visible) {
      const issHits = raycaster.intersectObject(issSprite);
      if (issHits.length > 0) {
        const issData = window.CelestialTracker ? window.CelestialTracker.getISS() : null;
        return {
          type: 'iss',
          data: { ...issSprite.userData, ...issData }
        };
      }
    }

    // Check threat halos (recursive — children of Groups)
    const haloHits = raycaster.intersectObjects(threatHalos, true);
    if (haloHits.length > 0) {
      // Walk parent chain to find the Group with sentry userData
      let obj = haloHits[0].object;
      while (obj && !(obj.userData && obj.userData.type === 'sentry')) obj = obj.parent;
      if (obj) {
        return {
          type: 'sentry',
          data: obj.userData
        };
      }
    }

    // Check regular NEO points
    if (neoPoints && neoPoints.visible && neoData.length > 0) {
      raycaster.params.Points = { threshold: 2.0 };
      const neoHits = raycaster.intersectObject(neoPoints);
      if (neoHits.length > 0) {
        const idx = neoHits[0].index;
        if (idx !== undefined && idx < neoData.length) {
          const neo = neoData[idx];
          return {
            type: 'neo',
            data: {
              name: neo.name || neo.id || 'Unknown NEO',
              missDistanceLunar: neo.missDistanceLunar,
              missDistanceKm: neo.missDistanceKm,
              velocityKmS: neo.velocityKmS,
              diameterMin: neo.estimatedDiameterMin,
              diameterMax: neo.estimatedDiameterMax,
              isPotentiallyHazardous: neo.isPotentiallyHazardous,
              closeApproachDate: neo.closeApproachDate
            }
          };
        }
      }
    }
    // Check deep sky objects
    if (deepSkySprites.length > 0) {
      const dsoHits = raycaster.intersectObjects(deepSkySprites);
      if (dsoHits.length > 0) {
        return {
          type: 'dso',
          data: dsoHits[0].object.userData
        };
      }
    }

    // Check meteor shower radiants
    if (meteorSprites.length > 0) {
      const meteorHits = raycaster.intersectObjects(meteorSprites);
      if (meteorHits.length > 0) {
        return {
          type: 'meteor',
          data: meteorHits[0].object.userData
        };
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // VISIBILITY
  // ═══════════════════════════════════════════════════════════

  function setVisible(visible) {
    enabled = visible;
    if (celestialGroup) celestialGroup.visible = visible;
  }

  function isVisible() {
    return enabled && celestialGroup && celestialGroup.visible;
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return {
    init,
    destroy,
    update,
    updateAll,
    hitTest,
    setVisible,
    isVisible,
    // Exposed for external access
    getPlanetSprites: () => planetSprites,
    getNEOData: () => neoData,
    _getGroup: () => celestialGroup
  };
})();

if (typeof window !== 'undefined') window.CelestialRenderer = CelestialRenderer;
