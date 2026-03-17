// ═══════════════════════════════════════════════════════════
// METEOR RENDERER — Streak Particle System
// Constellation Journal: Phase 4A
// ═══════════════════════════════════════════════════════════
// Renders meteor shower streaks emanating from radiant points.
// Each active shower spawns streaks proportional to ZHR * activity.
// Registers with SkyLayerManager as class 'celestial'.
// ═══════════════════════════════════════════════════════════

const MeteorRenderer = (() => {
  'use strict';

  const MAX_STREAKS = 60;      // max simultaneous streaks
  const SPHERE_RADIUS = 52;    // match planet sphere
  const STREAK_SPEED = 25;     // units/second
  const STREAK_LIFE = 0.8;     // seconds
  const SPAWN_BASE_INTERVAL = 2.0; // seconds between spawns at ZHR=100

  // ── State ──
  let scene = null;
  let camera = null;
  let meteorGroup = null;
  let streaks = [];            // active streak objects
  let activeShowers = [];
  let enabled = true;
  let elapsed = 0;
  let nextSpawnTime = 0;

  // ── Radiant markers ──
  let radiantSprites = [];

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init(threeScene, threeCamera) {
    scene = threeScene;
    camera = threeCamera;

    meteorGroup = new THREE.Group();
    meteorGroup.name = 'meteorShowers';
    scene.add(meteorGroup);

    // Register with SkyLayerManager if available
    if (window.SkyLayerManager) {
      window.SkyLayerManager.registerLayer({
        id: 'celestial-meteors',
        name: 'Meteor Showers',
        class: 'celestial',
        visible: true,
        group: meteorGroup,
        update: (dt) => update(dt)
      });
    }

    // Initial shower check
    refreshShowers();
  }

  // ═══════════════════════════════════════════════════════════
  // SHOWER REFRESH (check which showers are active)
  // ═══════════════════════════════════════════════════════════

  function refreshShowers(date) {
    if (!window.MeteorShowers) return;
    const d = date || new Date();
    activeShowers = window.MeteorShowers.getActiveShowers(d);

    // Update radiant markers
    clearRadiants();
    for (const { shower, activity } of activeShowers) {
      if (activity > 0.05) {
        createRadiantMarker(shower, activity);
      }
    }
  }

  function clearRadiants() {
    for (const sprite of radiantSprites) {
      meteorGroup.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
    radiantSprites = [];
  }

  // ═══════════════════════════════════════════════════════════
  // RADIANT POINT MARKERS
  // ═══════════════════════════════════════════════════════════

  function createRadiantMarker(shower, activity) {
    if (!window.OrbitalMechanics) return;

    const pos = window.OrbitalMechanics.raDec2Cartesian(shower.radiant.ra, shower.radiant.dec, SPHERE_RADIUS);

    // Subtle glow at radiant
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const center = 32;
    const c = new THREE.Color(shower.color);
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},${0.6 * activity})`);
    gradient.addColorStop(0.3, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},${0.3 * activity})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.scale.set(2.5 * activity + 1, 2.5 * activity + 1, 1);
    sprite.userData = {
      type: 'meteor_radiant',
      name: shower.name,
      zhr: shower.zhr,
      activity,
      parent: shower.parent
    };

    meteorGroup.add(sprite);
    radiantSprites.push(sprite);
  }

  // ═══════════════════════════════════════════════════════════
  // STREAK CREATION
  // ═══════════════════════════════════════════════════════════

  function spawnStreak(shower, activity) {
    if (!window.OrbitalMechanics || streaks.length >= MAX_STREAKS) return;

    const radiant = shower.radiant;

    // Random direction away from radiant (within ~30° cone)
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.random() * 30; // degrees
    const spreadRad = spread * Math.PI / 180;

    // Offset RA/Dec from radiant
    const dRA = Math.sin(angle) * spreadRad * (180 / Math.PI) / 15; // hours
    const dDec = Math.cos(angle) * spreadRad * (180 / Math.PI);

    const startRA = radiant.ra;
    const startDec = radiant.dec;
    const endRA = radiant.ra + dRA;
    const endDec = radiant.dec + dDec;

    const startPos = window.OrbitalMechanics.raDec2Cartesian(startRA, startDec, SPHERE_RADIUS + 0.5);
    const endPos = window.OrbitalMechanics.raDec2Cartesian(endRA, endDec, SPHERE_RADIUS + 0.5);

    // Streak line
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points
    positions[0] = startPos.x; positions[1] = startPos.y; positions[2] = startPos.z;
    positions[3] = startPos.x; positions[4] = startPos.y; positions[5] = startPos.z;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = new THREE.Color(shower.color);
    const material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8 * activity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const line = new THREE.Line(geometry, material);
    meteorGroup.add(line);

    streaks.push({
      line,
      startPos: new THREE.Vector3(startPos.x, startPos.y, startPos.z),
      endPos: new THREE.Vector3(endPos.x, endPos.y, endPos.z),
      age: 0,
      life: STREAK_LIFE * (0.5 + Math.random() * 0.5),
      maxOpacity: 0.8 * activity
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    if (!enabled || !meteorGroup) return;
    elapsed += dt;

    // Spawn new streaks based on active showers
    if (elapsed >= nextSpawnTime && activeShowers.length > 0) {
      // Pick a random active shower weighted by ZHR * activity
      const totalWeight = activeShowers.reduce((sum, s) => sum + s.shower.zhr * s.activity, 0);
      if (totalWeight > 0) {
        let r = Math.random() * totalWeight;
        for (const { shower, activity } of activeShowers) {
          r -= shower.zhr * activity;
          if (r <= 0) {
            spawnStreak(shower, activity);
            break;
          }
        }
      }

      // Next spawn interval — inversely proportional to total ZHR
      const effectiveZHR = activeShowers.reduce((sum, s) => sum + s.shower.zhr * s.activity, 0);
      nextSpawnTime = elapsed + Math.max(0.3, SPAWN_BASE_INTERVAL * 100 / Math.max(1, effectiveZHR));
    }

    // Update existing streaks
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.age += dt;

      const progress = Math.min(1, s.age / s.life);

      // Animate: head moves from start to end, tail follows
      const headT = progress;
      const tailT = Math.max(0, progress - 0.4); // tail lags behind

      const positions = s.line.geometry.attributes.position.array;

      // Tail position (lerp)
      positions[0] = s.startPos.x + (s.endPos.x - s.startPos.x) * tailT;
      positions[1] = s.startPos.y + (s.endPos.y - s.startPos.y) * tailT;
      positions[2] = s.startPos.z + (s.endPos.z - s.startPos.z) * tailT;

      // Head position (lerp)
      positions[3] = s.startPos.x + (s.endPos.x - s.startPos.x) * headT;
      positions[4] = s.startPos.y + (s.endPos.y - s.startPos.y) * headT;
      positions[5] = s.startPos.z + (s.endPos.z - s.startPos.z) * headT;

      s.line.geometry.attributes.position.needsUpdate = true;

      // Fade in then out
      const fade = progress < 0.2 ? progress / 0.2 : (1 - (progress - 0.2) / 0.8);
      s.line.material.opacity = s.maxOpacity * Math.max(0, fade);

      // Remove expired streaks
      if (s.age >= s.life) {
        meteorGroup.remove(s.line);
        s.line.geometry.dispose();
        s.line.material.dispose();
        streaks.splice(i, 1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VISIBILITY
  // ═══════════════════════════════════════════════════════════

  function setVisible(visible) {
    enabled = visible;
    if (meteorGroup) meteorGroup.visible = visible;
  }

  function isActive() {
    return activeShowers.length > 0;
  }

  function getActiveShowerInfo() {
    return activeShowers.map(s => ({
      name: s.shower.name,
      zhr: s.shower.zhr,
      activity: s.activity,
      parent: s.shower.parent,
      radiant: s.shower.radiant
    }));
  }

  // ═══════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════

  function destroy() {
    enabled = false;
    clearRadiants();
    for (const s of streaks) {
      meteorGroup.remove(s.line);
      s.line.geometry.dispose();
      s.line.material.dispose();
    }
    streaks = [];
    if (meteorGroup && scene) scene.remove(meteorGroup);
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    destroy,
    update,
    refreshShowers,
    setVisible,
    isActive,
    getActiveShowerInfo,
    _getGroup: () => meteorGroup
  });
})();

if (typeof window !== 'undefined') window.MeteorRenderer = MeteorRenderer;
