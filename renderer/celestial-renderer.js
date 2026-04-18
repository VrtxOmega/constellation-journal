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

    // ── Lighting for planet shading ──
    // Hemisphere light: warm sunlit side vs cool space fill
    const hemiLight = new THREE.HemisphereLight(0xFFEECC, 0x667788, 1.0);
    celestialGroup.add(hemiLight);

    // Directional light replaced with PointLight perfectly positioned at the Sun 
    // to radiate light physically correctly to all other planets.
    const sunLight = new THREE.PointLight(0xFFEEDD, 1.8, 0, 0); // High intensity, no falloff limit
    sunLight.position.set(0, 0, 0); // updated per-frame to Sun position
    celestialGroup.add(sunLight);
    celestialGroup._sunLight = sunLight;

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
    jupiter: 'textures/jupiter_hires.jpg',
    saturn: 'textures/saturn_hires.jpg',
    mars: 'textures/mars_hires.jpg',
    moon: 'textures/moon_hires.jpg',
    sun: 'textures/sun_hires.jpg',
    venus: 'textures/venus_hires.jpg',
    neptune: 'textures/neptune_hires.jpg',
    uranus: 'textures/uranus_hires.jpg',
    earth: 'textures/earth_hires.jpg',
    mercury: 'textures/mercury_hires.jpg',
    pluto: 'textures/pluto.jpg',  // no 8K Pluto available, keep original
  };

  function createPlanetSprites() {
    if (!window.OrbitalMechanics) return;
    const visuals = window.OrbitalMechanics.PLANET_VISUALS;
    const loader = new THREE.TextureLoader();

    for (const [name, vis] of Object.entries(visuals)) {
      const group = new THREE.Group();

      // ── Glow halo sprite ──
      const haloTex = createPlanetHaloTexture(128, vis.color, vis.glow);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: Math.min(1.0, vis.glow + 0.5)
      });
      const haloSprite = new THREE.Sprite(haloMat);
      
      // Store references in userData for dynamic LOD updates
      group.userData = { 
        type: 'planet', 
        name: name, 
        label: vis.label,
        halo: haloSprite,
        baseSize: vis.size,
        baseGlow: vis.glow
      };
      
      group.add(haloSprite);

      // ── 3D Sphere mesh with real photographic texture ──
      const sphereRadius = vis.size * 0.45;
      const segments = 128; // Increased from 64 to 128 for smoother terminator shadows
      const geometry = new THREE.SphereGeometry(sphereRadius, segments, segments);

      // ── The Sun is emissive and uses MeshBasicMaterial ──
      // ── Planets use MeshStandardMaterial to receive dynamic light from the Sun ──
      const isSun = (name === 'sun');
      let meshMat;
      if (isSun) {
        meshMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(vis.color),
          transparent: false,
          depthWrite: true,
        });
      } else {
        meshMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(vis.color),
          roughness: 0.8,
          metalness: 0.1,
          transparent: false,
          depthWrite: true,
        });
      }
      const mesh = new THREE.Mesh(geometry, meshMat);

      // Load real photographic texture with anisotropic filtering
      const texPath = PLANET_TEXTURES[name];
      if (texPath) {
        loader.load(
          texPath, 
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 16;
            tex.generateMipmaps = true;
            meshMat.map = tex;
            meshMat.color.set(0xffffff); // neutral tint so texture shows true color
            meshMat.needsUpdate = true;
          },
          undefined,
          (err) => {
            console.error(`Error loading texture ${texPath}:`, err);
          }
        );
      }
      mesh.renderOrder = 2;
      group.add(mesh);

      // ── Saturn ring — separate RingGeometry ──
      if (name === 'saturn') {
        const innerR = sphereRadius * 1.25;
        const outerR = sphereRadius * 2.2;
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 128);
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
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.8)`);
        grad.addColorStop(0.2, `rgba(${cr},${cg},${cb},0.4)`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.1)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
      } else if (dso.type === 'galaxy') {
        ctx.save();
        ctx.translate(center, center);
        ctx.scale(1, 0.6); // elliptical
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, center);
        grad.addColorStop(0, `rgba(${Math.min(255,cr+60)},${Math.min(255,cg+50)},${Math.min(255,cb+40)},0.9)`);
        grad.addColorStop(0.15, `rgba(${cr},${cg},${cb},0.5)`);
        grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.15)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-center, -center * 2, 64, 64 * 2);
        ctx.restore();
      } else { // cluster
        const grad = ctx.createRadialGradient(center, center, 0, center, center, center * 0.7);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.6)`);
        grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.2)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        // Scatter stars
        for (let i = 0; i < 15; i++) {
          const sx = center + (Math.random() - 0.5) * 30;
          const sy = center + (Math.random() - 0.5) * 30;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.4 + Math.random(), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${Math.min(255,cr+50)},${Math.min(255,cg+50)},${Math.min(255,cb+50)},${0.5 + Math.random() * 0.5})`;
          ctx.fill();
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.75, // boosted slightly for tightening effect
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
        baseSize: dso.size // save base size for dynamic LOD scaling
      };

      celestialGroup.add(sprite);
      deepSkySprites.push(sprite);
    }
  }

  function updateDSOs() {
    if (!deepSkySprites || deepSkySprites.length === 0 || !camera) return;

    for (const sprite of deepSkySprites) {
      const dist = camera.position.distanceTo(sprite.position);
      
      // Dynamic LOD Scaling for DSOs
      // Goal: At 1x zoom (dist ~35), shrink/tighten them so they don't smear.
      // We scale them linearly with distance so they maintain roughly constant visual size
      // on screen, behaving like distant objects at infinity rather than massive blurry clouds.
      
      // Base scale was originally set directly as `dso.size`. Let's assume standard viewing distance is 20.
      const scaleFactor = Math.max(0.3, dist / 25.0); 
      // If dist=35 (mid-range), scale drops relative to the massive size they used to be at that dist.
      
      const newSize = sprite.userData.baseSize * scaleFactor * 0.6; // 0.6 tightens everything inherently
      sprite.scale.set(newSize, newSize, 1);

      // Fade out slightly when extremely close so you can focus on planets, but remain visible
      let targetOp = Math.min(1.0, dist / 15.0) * 0.8;
      sprite.material.opacity = targetOp;
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
        // Use log of distance (AU) to spread planets apart more aggressively
        // Inner planets (~0.5-2 AU) → offset ~0-2, outer planets (~10-30 AU) → offset ~7-10
        const distAU = p.dist || 1;
        const depthOffset = Math.log10(Math.max(1, distAU)) * 7.0;
        r = SPHERE_RADIUS + depthOffset;
      }
      const pos = window.OrbitalMechanics.raDec2Cartesian(p.ra, p.dec, r);
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.visible = true;

      // Dynamic LOD for Halo & Mesh
      if (sprite.userData && sprite.userData.halo) {
        // Distance from camera to planet
        let dist = 100;
        if (typeof camera !== 'undefined' && camera.position) {
          dist = camera.position.distanceTo(sprite.position);
        }
        
        const halo = sprite.userData.halo;
        const baseSize = sprite.userData.baseSize;
        const glowMult = sprite.userData.baseGlow || 0;

        // t interpolates from 0.0 (close up, dist <= 10) to 1.0 (mid/far range, dist >= 35)
        const t = Math.max(0, Math.min(1.0, (dist - 10) / 25.0));

        // Opacity: starts high (e.g. 80% for atmospheric rim) and drops to 30% at mid-range
        // to prevent blooming the planet edge and washing out rings.
        const maxOp = 0.4 + glowMult * 0.4; // up to 0.8
        let targetOpacity = maxOp + (0.25 - maxOp) * t; 
        halo.material.opacity = targetOpacity;

        // Scale: Starts wide (atmospheric scattering) and pulls in tight (2.2x radius) at mid-range
        const scaleMult = 3.6 + (2.1 - 3.6) * t; 
        const dynamicScale = baseSize * 0.45 * scaleMult;
        halo.scale.set(dynamicScale, dynamicScale, 1);
        
        // Hide if fully transparent
        halo.visible = targetOpacity > 0.01;
      }

      // Apply continuous rotation based on actual elapsed real-world time or a simple accumulator
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (sprite._mesh && window.OrbitalMechanics && window.OrbitalMechanics.PLANET_VISUALS[p.name]) {
        const speed = window.OrbitalMechanics.PLANET_VISUALS[p.name].rotSpeed || 0;
        sprite._mesh.rotation.y = (nowMs / 1000) * speed;
      }

      // Update directional light to track Sun position
      if (p.name === 'sun' && celestialGroup._sunLight) {
        celestialGroup._sunLight.position.set(pos.x, pos.y, pos.z);
      }

      // Store data for tooltip
      sprite.userData.ra = p.ra;
      sprite.userData.dec = p.dec;
      sprite.userData.dist = p.dist;
      if (p.illumination !== undefined) sprite.userData.illumination = p.illumination;

      // True 3D phase shadows are now handled by MeshStandardMaterial and the directional sunLight.
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
        const haloOpacity = lerp(0.10, 0.25, t);

        // For sphere mesh, scale uniformly (not 2D like sprites)
        const mScale = meshScale * 0.45 / (base * 0.45); // normalize to unit sphere
        group._disc.scale.set(mScale, mScale, mScale);

        // Saturn: wider for ring visibility
        if (name === 'saturn') {
          const saturnScale = lerp(1.6, 0.7, t) * base * 0.45 / (base * 0.45);
          group._disc.scale.set(saturnScale, saturnScale, saturnScale);
        }

        group._halo.scale.set(haloScale, haloScale, 1);
        group._halo.material.opacity = haloOpacity;

        // ── Planet rotation — use rotSpeed from PLANET_VISUALS ──
        const vis = window.OrbitalMechanics && window.OrbitalMechanics.PLANET_VISUALS[name];
        const rate = vis && vis.rotSpeed !== undefined ? vis.rotSpeed : 0.01;
        group._disc.rotation.y += rate * dt;
      }
    }

    // ── Subtle NEO pulse ──
    updateDSOs();
    
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
