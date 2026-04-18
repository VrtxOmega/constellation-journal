// ═══════════════════════════════════════════════════════════
// COSMIC FLOW PARTICLE SYSTEM — GPU-accelerated particle physics
// Pre-allocated buffer pool with GLSL shaders for zero-allocation
// runtime performance. Supports burst, stream, and attract modes.
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  const MAX_PARTICLES = 3000;
  const DRAG = 0.96;         // velocity decay per frame
  const STREAM_SPEED = 6.0;  // units per second along constellation lines
  const ATTRACT_RADIUS = 18; // hover attraction radius
  const ATTRACT_FORCE = 0.8; // inverse-square coefficient

  // ── Pre-allocated arrays ──
  const positions   = new Float32Array(MAX_PARTICLES * 3);
  const velocities  = new Float32Array(MAX_PARTICLES * 3);
  const colors      = new Float32Array(MAX_PARTICLES * 3);
  const sizes       = new Float32Array(MAX_PARTICLES);
  const lifetimes   = new Float32Array(MAX_PARTICLES);  // remaining life (seconds), 0 = dead
  const maxLifes    = new Float32Array(MAX_PARTICLES);   // original max lifetime
  const types       = new Uint8Array(MAX_PARTICLES);     // 0=dead, 1=burst, 2=stream, 3=attract

  // ── Stream particle metadata ──
  const streamData = new Array(MAX_PARTICLES).fill(null); // { startPos, endPos, progress, wobblePhase }

  let points = null;
  let geometry = null;
  let material = null;
  let scene = null;
  let initialized = false;

  // ── Active attract target ──
  let attractTarget = null; // THREE.Vector3 or null

  // ── Active streams ──
  let activeStreams = []; // [{ startPos, endPos, color, interval, _timer }]

  function init(threeScene) {
    scene = threeScene;

    // Initialize all particles as dead
    lifetimes.fill(0);
    types.fill(0);

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lifetimes, 1));
    geometry.setAttribute('aMaxLife', new THREE.BufferAttribute(maxLifes, 1));

    // ── Soft radial gradient texture ──
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const particleTex = new THREE.CanvasTexture(cv);

    material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: window.devicePixelRatio },
        uMap: { value: particleTex },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aLife;
        attribute float aMaxLife;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          float lifeRatio = aMaxLife > 0.0 ? aLife / aMaxLife : 0.0;
          // Fade in quickly (first 10%), fade out slowly (last 40%)
          float fadeIn = smoothstep(0.0, 0.1, 1.0 - lifeRatio);
          float fadeOut = smoothstep(0.0, 0.4, lifeRatio);
          vAlpha = fadeIn * fadeOut;
          // Hide dead particles
          if (aLife <= 0.0) vAlpha = 0.0;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * uPixelRatio * (300.0 / -mvPos.z) * (0.5 + 0.5 * lifeRatio);
          if (aLife <= 0.0) gl_PointSize = 0.0;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        uniform sampler2D uMap;
        void main() {
          vec4 texColor = texture2D(uMap, gl_PointCoord);
          float intensity = texColor.r;
          gl_FragColor = vec4(vColor * intensity * 1.5, vAlpha * intensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    points = new THREE.Points(geometry, material);
    points.renderOrder = 5; // render on top of most things
    points.frustumCulled = false;
    scene.add(points);
    initialized = true;
  }

  // ── Find a dead particle slot ──
  function allocate() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (lifetimes[i] <= 0) return i;
    }
    return -1; // pool exhausted
  }

  // ══════════════════════════════════════════════════════════
  // BURST — Ignition debris explosion
  // ══════════════════════════════════════════════════════════
  function burst(origin, color, count, options = {}) {
    if (!initialized) return;
    const speed = options.speed || 12;
    const life = options.life || 2.0;
    const sizeMin = options.sizeMin || 1.5;
    const sizeMax = options.sizeMax || 4.0;
    const hueVariation = options.hueVariation || 0.08;

    const baseColor = new THREE.Color(color);
    const hsl = {};
    baseColor.getHSL(hsl);

    for (let n = 0; n < count; n++) {
      const i = allocate();
      if (i < 0) break;

      // Random direction on unit sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.3 + Math.random() * 0.7);

      positions[i * 3]     = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      velocities[i * 3]     = Math.sin(phi) * Math.cos(theta) * spd;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * spd;
      velocities[i * 3 + 2] = Math.cos(phi) * spd;

      // Slight hue variation per particle
      const particleColor = new THREE.Color();
      particleColor.setHSL(
        hsl.h + (Math.random() - 0.5) * hueVariation,
        Math.min(1, hsl.s + Math.random() * 0.1),
        Math.min(1, hsl.l + (Math.random() - 0.5) * 0.15)
      );
      colors[i * 3]     = particleColor.r;
      colors[i * 3 + 1] = particleColor.g;
      colors[i * 3 + 2] = particleColor.b;

      sizes[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
      lifetimes[i] = life * (0.6 + Math.random() * 0.4);
      maxLifes[i] = lifetimes[i];
      types[i] = 1;
      streamData[i] = null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // STREAM — Flowing particles along constellation lines
  // ══════════════════════════════════════════════════════════
  function startStream(startPos, endPos, color, options = {}) {
    if (!initialized) return;
    const spawnRate = options.spawnRate || 1500; // ms between spawns
    const stream = {
      startPos: startPos.clone(),
      endPos: endPos.clone(),
      color: new THREE.Color(color),
      spawnRate,
      _timer: 0,
      _lastSpawn: 0,
    };
    activeStreams.push(stream);
    // Spawn one immediately
    _spawnStreamParticle(stream);
    return stream;
  }

  function stopAllStreams() {
    activeStreams = [];
  }

  function _spawnStreamParticle(stream) {
    const i = allocate();
    if (i < 0) return;

    const dir = stream.endPos.clone().sub(stream.startPos);
    const dist = dir.length();
    const life = dist / STREAM_SPEED;

    positions[i * 3]     = stream.startPos.x;
    positions[i * 3 + 1] = stream.startPos.y;
    positions[i * 3 + 2] = stream.startPos.z;

    velocities[i * 3]     = 0;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;

    colors[i * 3]     = stream.color.r;
    colors[i * 3 + 1] = stream.color.g;
    colors[i * 3 + 2] = stream.color.b;

    sizes[i] = 2.0 + Math.random() * 1.5;
    lifetimes[i] = life;
    maxLifes[i] = life;
    types[i] = 2;

    streamData[i] = {
      startPos: stream.startPos.clone(),
      endPos: stream.endPos.clone(),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleFreq: 1.5 + Math.random() * 1.5,
      wobbleAmp: 0.4 + Math.random() * 0.6,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ATTRACT — Hover gravitational pull
  // ══════════════════════════════════════════════════════════
  function setAttractTarget(position) {
    attractTarget = position ? position.clone() : null;
  }

  function _spawnAttractParticles() {
    if (!attractTarget) return;
    // Spawn a few ambient particles near the attract target
    for (let n = 0; n < 3; n++) {
      const i = allocate();
      if (i < 0) break;

      // Spawn in a shell around the target
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = ATTRACT_RADIUS * (0.5 + Math.random() * 0.5);

      positions[i * 3]     = attractTarget.x + Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = attractTarget.y + Math.sin(phi) * Math.sin(theta) * r;
      positions[i * 3 + 2] = attractTarget.z + Math.cos(phi) * r;

      velocities[i * 3]     = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      colors[i * 3]     = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;

      sizes[i] = 1.0 + Math.random() * 1.5;
      lifetimes[i] = 2.0 + Math.random() * 1.5;
      maxLifes[i] = lifetimes[i];
      types[i] = 3;
      streamData[i] = null;
    }
  }

  let _attractSpawnTimer = 0;

  // ══════════════════════════════════════════════════════════
  // UPDATE — Per-frame simulation
  // ══════════════════════════════════════════════════════════
  function update(dt) {
    if (!initialized || !points) return;

    let anyAlive = false;

    // ── Stream spawning ──
    const now = performance.now();
    for (const stream of activeStreams) {
      if (now - stream._lastSpawn > stream.spawnRate) {
        _spawnStreamParticle(stream);
        stream._lastSpawn = now;
      }
    }

    // ── Attract particle spawning ──
    if (attractTarget) {
      _attractSpawnTimer += dt;
      if (_attractSpawnTimer > 0.15) { // every 150ms
        _spawnAttractParticles();
        _attractSpawnTimer = 0;
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (lifetimes[i] <= 0) continue;
      anyAlive = true;

      lifetimes[i] -= dt;
      if (lifetimes[i] <= 0) {
        lifetimes[i] = 0;
        types[i] = 0;
        streamData[i] = null;
        continue;
      }

      const type = types[i];

      // ── BURST particles: physics-based motion ──
      if (type === 1) {
        velocities[i * 3]     *= DRAG;
        velocities[i * 3 + 1] *= DRAG;
        velocities[i * 3 + 2] *= DRAG;

        positions[i * 3]     += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      }

      // ── STREAM particles: lerp along line with wobble ──
      else if (type === 2 && streamData[i]) {
        const sd = streamData[i];
        const progress = 1.0 - (lifetimes[i] / maxLifes[i]);
        const t = progress;

        // Lerp position along the line
        const lx = sd.startPos.x + (sd.endPos.x - sd.startPos.x) * t;
        const ly = sd.startPos.y + (sd.endPos.y - sd.startPos.y) * t;
        const lz = sd.startPos.z + (sd.endPos.z - sd.startPos.z) * t;

        // Perpendicular wobble
        const dir = new THREE.Vector3().subVectors(sd.endPos, sd.startPos).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const perp = new THREE.Vector3().crossVectors(dir, up).normalize();
        if (perp.length() < 0.01) perp.set(1, 0, 0);
        const wobble = Math.sin(progress * sd.wobbleFreq * Math.PI * 2 + sd.wobblePhase) * sd.wobbleAmp;

        positions[i * 3]     = lx + perp.x * wobble;
        positions[i * 3 + 1] = ly + perp.y * wobble;
        positions[i * 3 + 2] = lz + perp.z * wobble;
      }

      // ── ATTRACT particles: gravitational pull toward target ──
      else if (type === 3) {
        if (attractTarget) {
          const dx = attractTarget.x - positions[i * 3];
          const dy = attractTarget.y - positions[i * 3 + 1];
          const dz = attractTarget.z - positions[i * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(distSq);

          if (dist > 0.5) {
            const force = ATTRACT_FORCE / Math.max(distSq, 1.0);
            velocities[i * 3]     += (dx / dist) * force;
            velocities[i * 3 + 1] += (dy / dist) * force;
            velocities[i * 3 + 2] += (dz / dist) * force;
          }
        }

        // Apply drag and velocity
        velocities[i * 3]     *= 0.92;
        velocities[i * 3 + 1] *= 0.92;
        velocities[i * 3 + 2] *= 0.92;

        positions[i * 3]     += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      }
    }

    // ── Update GPU buffers ──
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aLife.needsUpdate = true;
    geometry.attributes.aMaxLife.needsUpdate = true;
  }

  // ── Expose API ──
  window.ParticleSystem = {
    init,
    burst,
    startStream,
    stopAllStreams,
    setAttractTarget,
    update,
  };
})();
