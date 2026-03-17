// ═══════════════════════════════════════════════════════════
// MEANING OBJECTS — Visual Archetypes for Journal Stars
// Constellation Journal: Meaning Layer
// ═══════════════════════════════════════════════════════════
// Enriches journal stars with visual archetypes derived from
// valence, arousal, and text length. No user input needed.
//
// Archetypes:
//   Nova        — high valence + high arousal (breakthrough)
//   Nebula      — high valence + low arousal (peace)
//   Binary      — low valence + high arousal (tension)
//   Dwarf       — low valence + low arousal (quiet sadness)
//   Accretion   — long-form entry (1200+ chars)
//   Thread      — recurring emotion (3+ same in 7 days)
// ═══════════════════════════════════════════════════════════

const MeaningObjects = (() => {
  'use strict';

  const ARCHETYPES = Object.freeze({
    NOVA:      'nova',
    NEBULA:    'nebula',
    BINARY:    'binary',
    DWARF:     'dwarf',
    ACCRETION: 'accretion',
    THREAD:    'thread'
  });

  // ── State ──
  let scene = null;
  let meaningGroup = null;
  let objects = [];       // { type, mesh/sprite, starIdx, phase, ... }
  let enabled = true;
  let elapsed = 0;

  // ═══════════════════════════════════════════════════════════
  // CLASSIFICATION ENGINE
  // ═══════════════════════════════════════════════════════════

  /**
   * Classify an entry into meaning archetypes.
   * Returns array of archetype strings (entry can have multiple).
   */
  function classify(entry) {
    const types = [];
    const v = entry.valence || 0;
    const a = entry.arousal || 0;
    const len = (entry.text || '').length;

    // Emotional quadrant classification
    if (v > 0.5 && a > 0.5)       types.push(ARCHETYPES.NOVA);
    else if (v > 0.3 && a < -0.2) types.push(ARCHETYPES.NEBULA);
    else if (v < -0.3 && a > 0.5) types.push(ARCHETYPES.BINARY);
    else if (v < -0.3 && a < -0.2) types.push(ARCHETYPES.DWARF);

    // Length-based
    if (len > 1200) types.push(ARCHETYPES.ACCRETION);

    return types;
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init(threeScene) {
    scene = threeScene;
    meaningGroup = new THREE.Group();
    meaningGroup.name = 'meaningObjects';
    scene.add(meaningGroup);

    if (window.SkyLayerManager) {
      window.SkyLayerManager.registerLayer({
        id: 'personal-meaning',
        name: 'Meaning Objects',
        class: 'personal',
        visible: true,
        group: meaningGroup,
        update: (dt) => update(dt)
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ARCHETYPE CREATORS
  // ═══════════════════════════════════════════════════════════

  function addMeaning(starIdx, starPosition, archetypes, colorHex) {
    if (!meaningGroup || !starPosition) return;
    const color = new THREE.Color(colorHex || '#FFD700');

    for (const type of archetypes) {
      switch (type) {
        case ARCHETYPES.NOVA:      createNova(starIdx, starPosition, color); break;
        case ARCHETYPES.NEBULA:    createNebula(starIdx, starPosition, color); break;
        case ARCHETYPES.BINARY:    createBinary(starIdx, starPosition, color); break;
        case ARCHETYPES.DWARF:     createDwarf(starIdx, starPosition, color); break;
        case ARCHETYPES.ACCRETION: createAccretion(starIdx, starPosition, color); break;
      }
    }
  }

  // ── Nova: radial burst ring that pulses ──
  function createNova(starIdx, pos, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const c = 64;
    const cr = Math.floor(color.r * 255);
    const cg = Math.floor(color.g * 255);
    const cb = Math.floor(color.b * 255);

    // Radial burst — bright center, spiky ring
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, `rgba(255,255,255,0.9)`);
    grad.addColorStop(0.15, `rgba(${cr},${cg},${cb},0.6)`);
    grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.15)`);
    grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.25)`); // ring
    grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},0.05)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Spike rays
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(angle) * 20, c + Math.sin(angle) * 20);
      ctx.lineTo(c + Math.cos(angle) * 55, c + Math.sin(angle) * 55);
      ctx.strokeStyle = `rgba(255,255,240,0.3)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0.7
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.scale.set(4.5, 4.5, 1);
    sprite.renderOrder = 2;
    meaningGroup.add(sprite);

    objects.push({
      type: ARCHETYPES.NOVA, obj: sprite, starIdx,
      phase: Math.random() * Math.PI * 2, baseScale: 4.5
    });
  }

  // ── Nebula: soft cloud sprite around star ──
  function createNebula(starIdx, pos, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const c = 64;
    const cr = Math.floor(color.r * 255);
    const cg = Math.floor(color.g * 255);
    const cb = Math.floor(color.b * 255);

    // Soft asymmetric cloud
    for (let blob = 0; blob < 4; blob++) {
      const ox = (Math.random() - 0.5) * 40;
      const oy = (Math.random() - 0.5) * 40;
      const r = 25 + Math.random() * 20;
      const grad = ctx.createRadialGradient(c + ox, c + oy, 0, c + ox, c + oy, r);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.15)`);
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.06)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0.5
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.scale.set(6, 6, 1);
    meaningGroup.add(sprite);

    objects.push({
      type: ARCHETYPES.NEBULA, obj: sprite, starIdx,
      phase: Math.random() * Math.PI * 2, baseScale: 6
    });
  }

  // ── Binary: orbiting companion point ──
  function createBinary(starIdx, pos, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    const cr = Math.floor(color.r * 200); // slightly dimmer
    const cg = Math.floor(color.g * 200);
    const cb = Math.floor(color.b * 200);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
    grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.4)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0.8
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x + 1.5, pos.y, pos.z);
    sprite.scale.set(1.8, 1.8, 1);
    meaningGroup.add(sprite);

    objects.push({
      type: ARCHETYPES.BINARY, obj: sprite, starIdx,
      center: new THREE.Vector3(pos.x, pos.y, pos.z),
      orbitRadius: 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 0.4
    });
  }

  // ── Dwarf: dim companion offset below ──
  function createDwarf(starIdx, pos, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 24;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    const cr = Math.floor(color.r * 120);
    const cg = Math.floor(color.g * 120);
    const cb = Math.floor(color.b * 150);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.6)`);
    grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.2)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(12, 12, 12, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0.5
    });
    const sprite = new THREE.Sprite(mat);
    // Offset below and slightly to the right
    const norm = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    const offset = norm.cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(1.2);
    sprite.position.set(pos.x + offset.x, pos.y - 0.8, pos.z + offset.z);
    sprite.scale.set(1.2, 1.2, 1);
    meaningGroup.add(sprite);

    objects.push({
      type: ARCHETYPES.DWARF, obj: sprite, starIdx,
      phase: Math.random() * Math.PI * 2
    });
  }

  // ── Accretion: subtle ring around star ──
  function createAccretion(starIdx, pos, color) {
    const geometry = new THREE.TorusGeometry(2.0, 0.08, 8, 48);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const torus = new THREE.Mesh(geometry, material);
    torus.position.set(pos.x, pos.y, pos.z);
    // Tilt the ring to face the camera roughly
    torus.lookAt(0, 0, 0);
    torus.rotateX(Math.PI * 0.45);
    meaningGroup.add(torus);

    objects.push({
      type: ARCHETYPES.ACCRETION, obj: torus, starIdx,
      phase: Math.random() * Math.PI * 2
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CONSTELLATION THREADS (recurring emotions)
  // ═══════════════════════════════════════════════════════════

  function buildThreads(starDataArr, starPositions) {
    if (!starDataArr || !starPositions) return;

    // Scan for recurring emotions within 7-day windows
    const emotionRuns = {}; // emotion_label → [indices]
    for (let i = 0; i < starDataArr.length; i++) {
      const entry = starDataArr[i];
      if (!entry || !entry.emotion_label) continue;
      const label = entry.emotion_label.toLowerCase();
      if (!emotionRuns[label]) emotionRuns[label] = [];
      emotionRuns[label].push(i);
    }

    for (const [label, indices] of Object.entries(emotionRuns)) {
      // Find clusters of 3+ within 7 DOY
      for (let start = 0; start < indices.length; start++) {
        const cluster = [indices[start]];
        for (let j = start + 1; j < indices.length; j++) {
          if (indices[j] - indices[start] <= 7) {
            cluster.push(indices[j]);
          } else break;
        }
        if (cluster.length >= 3) {
          createThread(cluster, starPositions, label);
          start += cluster.length - 1; // skip past cluster
        }
      }
    }
  }

  function createThread(indices, starPositions, emotionLabel) {
    const points = [];
    for (const idx of indices) {
      const p = starPositions[idx];
      if (p) points.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    if (points.length < 3) return;

    // Faint connecting line
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const emotionColors = {
      joy: 0xFFDD44, calm: 0x88BBFF, sadness: 0x6666CC,
      anger: 0xFF4422, fear: 0x994488, love: 0xFF88AA,
      hope: 0xAAFFAA, nostalgia: 0xDDBB88
    };
    const color = emotionColors[emotionLabel] || 0x888888;

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    meaningGroup.add(line);

    objects.push({
      type: ARCHETYPES.THREAD, obj: line,
      indices, phase: 0
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    if (!enabled || !meaningGroup) return;
    elapsed += dt;

    for (const obj of objects) {
      switch (obj.type) {
        case ARCHETYPES.NOVA: {
          // Gentle pulse
          const pulse = 1.0 + Math.sin(elapsed * 2.0 + obj.phase) * 0.15;
          const s = obj.baseScale * pulse;
          obj.obj.scale.set(s, s, 1);
          obj.obj.material.opacity = 0.5 + Math.sin(elapsed * 1.5 + obj.phase) * 0.2;
          break;
        }
        case ARCHETYPES.NEBULA: {
          // Very slow drift/breathe
          const breathe = 1.0 + Math.sin(elapsed * 0.4 + obj.phase) * 0.08;
          const s = obj.baseScale * breathe;
          obj.obj.scale.set(s, s, 1);
          break;
        }
        case ARCHETYPES.BINARY: {
          // Orbit around parent star
          const angle = elapsed * obj.speed + obj.phase;
          // Create an orbit plane perpendicular to the star's radial direction
          const radial = obj.center.clone().normalize();
          const tangent = new THREE.Vector3(0, 1, 0).cross(radial).normalize();
          const binormal = radial.clone().cross(tangent).normalize();

          obj.obj.position.copy(obj.center)
            .addScaledVector(tangent, Math.cos(angle) * obj.orbitRadius)
            .addScaledVector(binormal, Math.sin(angle) * obj.orbitRadius);
          break;
        }
        case ARCHETYPES.DWARF: {
          // Subtle twinkle
          obj.obj.material.opacity = 0.35 + Math.sin(elapsed * 1.2 + obj.phase) * 0.15;
          break;
        }
        case ARCHETYPES.ACCRETION: {
          // Slow rotation
          obj.obj.rotation.z += dt * 0.15;
          break;
        }
        case ARCHETYPES.THREAD: {
          // Subtle opacity shimmer
          obj.obj.material.opacity = 0.08 + Math.sin(elapsed * 0.7 + obj.phase) * 0.04;
          break;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════

  function clear() {
    for (const obj of objects) {
      meaningGroup.remove(obj.obj);
      if (obj.obj.geometry) obj.obj.geometry.dispose();
      if (obj.obj.material) {
        if (obj.obj.material.map) obj.obj.material.map.dispose();
        obj.obj.material.dispose();
      }
    }
    objects = [];
  }

  function destroy() {
    enabled = false;
    clear();
    if (meaningGroup && scene) scene.remove(meaningGroup);
    meaningGroup = null;
  }

  function setVisible(visible) {
    enabled = visible;
    if (meaningGroup) meaningGroup.visible = visible;
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    ARCHETYPES,
    init,
    classify,
    addMeaning,
    buildThreads,
    update,
    clear,
    destroy,
    setVisible
  });
})();

if (typeof window !== 'undefined') window.MeaningObjects = MeaningObjects;
