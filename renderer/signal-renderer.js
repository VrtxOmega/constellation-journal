// ═══════════════════════════════════════════════════════════
// SIGNAL RENDERER — Great-Circle Radio Arcs
// Constellation Journal: Signal Layer
// ═══════════════════════════════════════════════════════════
// Renders WSPR/FT8 propagation spots as great-circle arcs
// across the celestial sphere. Each arc traces the ionospheric
// bounce path between transmitter and receiver.
// ═══════════════════════════════════════════════════════════

const SignalRenderer = (() => {
  'use strict';

  const SPHERE_RADIUS = 48;     // inside the star sphere (52) so arcs sit behind stars
  const ARC_SEGMENTS = 32;      // smoothness of each arc
  const ARC_FADE_IN = 2.0;      // seconds
  const ARC_LIFE = 55;          // seconds before fade
  const ARC_FADE_OUT = 4.0;     // seconds
  const MAX_ARCS = 40;          // performance cap

  // ── State ──
  let scene = null;
  let signalGroup = null;
  let arcs = [];     // { line, life, age, maxOpacity, ... }
  let enabled = true;
  let elapsed = 0;

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init(threeScene, threeCamera) {
    scene = threeScene;
    signalGroup = new THREE.Group();
    signalGroup.name = 'signalArcs';
    scene.add(signalGroup);

    if (window.SkyLayerManager) {
      window.SkyLayerManager.registerLayer({
        id: 'signal-wspr',
        name: 'WSPR Propagation',
        class: 'signal',
        visible: true,
        group: signalGroup,
        update: (dt) => update(dt)
      });
    }

    // Connect to WSPR client if available
    if (window.WSPRClient) {
      window.WSPRClient.onSpots((spots) => {
        for (const spot of spots) {
          addSpotArc(spot);
        }
      });
      window.WSPRClient.startAutoRefresh();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GREAT-CIRCLE ARC GEOMETRY
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a great-circle arc between two lat/lon points,
   * projected onto the celestial sphere at SPHERE_RADIUS.
   */
  function createGreatCircleArc(lat1, lon1, lat2, lon2, date) {
    const points = [];
    const toRad = Math.PI / 180;

    // Convert to sky positions
    const sky1 = window.WSPRClient
      ? window.WSPRClient.latLonToSkyPos(lat1, lon1, date)
      : { ra: lon1 / 15 + 12, dec: lat1 };
    const sky2 = window.WSPRClient
      ? window.WSPRClient.latLonToSkyPos(lat2, lon2, date)
      : { ra: lon2 / 15 + 12, dec: lat2 };

    // Convert RA/Dec to 3D positions on sphere
    function raDec2Vec(ra, dec) {
      const raRad = ra * 15 * toRad; // hours → degrees → radians
      const decRad = dec * toRad;
      return new THREE.Vector3(
        SPHERE_RADIUS * Math.cos(decRad) * Math.cos(raRad),
        SPHERE_RADIUS * Math.sin(decRad),
        -SPHERE_RADIUS * Math.cos(decRad) * Math.sin(raRad)
      );
    }

    const v1 = raDec2Vec(sky1.ra, sky1.dec);
    const v2 = raDec2Vec(sky2.ra, sky2.dec);

    // Slerp between v1 and v2 with slight outward bulge (ionosphere bounce)
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;

      // Spherical linear interpolation
      const dot = v1.clone().normalize().dot(v2.clone().normalize());
      const omega = Math.acos(Math.max(-1, Math.min(1, dot)));

      let p;
      if (Math.abs(omega) < 0.001) {
        p = v1.clone().lerp(v2, t);
      } else {
        const sinOmega = Math.sin(omega);
        const a = Math.sin((1 - t) * omega) / sinOmega;
        const b = Math.sin(t * omega) / sinOmega;
        p = v1.clone().multiplyScalar(a).add(v2.clone().multiplyScalar(b));
      }

      // Bulge outward at midpoint (simulates ionospheric F-layer bounce)
      const bulge = Math.sin(t * Math.PI) * 1.5;
      p.normalize().multiplyScalar(SPHERE_RADIUS + bulge);

      points.push(p);
    }

    return points;
  }

  // ═══════════════════════════════════════════════════════════
  // ADD ARC FROM WSPR SPOT
  // ═══════════════════════════════════════════════════════════

  function addSpotArc(spot) {
    if (!signalGroup || arcs.length >= MAX_ARCS) return;

    const points = createGreatCircleArc(
      spot.txLat, spot.txLon,
      spot.rxLat, spot.rxLon
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = new THREE.Color(spot.color || 0x44EEFF);

    // SNR-based opacity: -20 dB = dim, +20 dB = bright
    // Keep arcs subtle — they're background traces, not primary objects
    const snrNorm = Math.max(0, Math.min(1, (spot.snr + 20) / 40));
    const maxOpacity = 0.06 + snrNorm * 0.12;

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,          // starts invisible, fades in
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const line = new THREE.Line(geometry, material);
    line.userData = {
      type: 'wspr_arc',
      sender: spot.sender,
      receiver: spot.receiver,
      band: spot.band,
      snr: spot.snr,
      freq: spot.freq
    };
    signalGroup.add(line);

    arcs.push({
      line,
      age: 0,
      life: ARC_LIFE + Math.random() * 10,
      maxOpacity,
      spot
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    if (!enabled || !signalGroup) return;
    elapsed += dt;

    for (let i = arcs.length - 1; i >= 0; i--) {
      const arc = arcs[i];
      arc.age += dt;

      // Fade envelope: fade in → hold → fade out
      let opacity;
      if (arc.age < ARC_FADE_IN) {
        // Fade in
        opacity = (arc.age / ARC_FADE_IN) * arc.maxOpacity;
      } else if (arc.age < arc.life) {
        // Hold with subtle pulse
        const pulse = 1.0 + Math.sin(elapsed * 2 + i) * 0.1;
        opacity = arc.maxOpacity * pulse;
      } else if (arc.age < arc.life + ARC_FADE_OUT) {
        // Fade out
        const fadeProgress = (arc.age - arc.life) / ARC_FADE_OUT;
        opacity = arc.maxOpacity * (1 - fadeProgress);
      } else {
        // Remove expired arc
        signalGroup.remove(arc.line);
        arc.line.geometry.dispose();
        arc.line.material.dispose();
        arcs.splice(i, 1);
        continue;
      }

      arc.line.material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HIT TEST (for hover tooltips)
  // ═══════════════════════════════════════════════════════════

  function hitTest(raycaster) {
    if (!enabled || !signalGroup || arcs.length === 0) return null;

    // Raycast against arc lines with distance threshold
    const lines = arcs.map(a => a.line).filter(l => l.material.opacity > 0.05);
    if (lines.length === 0) return null;

    // Set raycaster line precision (default is too tight for thin lines)
    const oldThreshold = raycaster.params.Line ? raycaster.params.Line.threshold : 1;
    if (!raycaster.params.Line) raycaster.params.Line = {};
    raycaster.params.Line.threshold = 5.0;

    const hits = raycaster.intersectObjects(lines);
    raycaster.params.Line.threshold = oldThreshold; // restore

    if (hits.length > 0) {
      const hitLine = hits[0].object;
      const arcData = arcs.find(a => a.line === hitLine);
      if (arcData && arcData.spot) {
        return {
          type: 'wspr_arc',
          data: {
            sender: arcData.spot.sender,
            receiver: arcData.spot.receiver,
            band: arcData.spot.band,
            snr: arcData.spot.snr,
            freq: arcData.spot.freq
          }
        };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // VISIBILITY + STATS
  // ═══════════════════════════════════════════════════════════

  function setVisible(visible) {
    enabled = visible;
    if (signalGroup) signalGroup.visible = visible;
  }

  function getArcCount() {
    return arcs.length;
  }

  function destroy() {
    enabled = false;
    if (window.WSPRClient) window.WSPRClient.stopAutoRefresh();
    for (const arc of arcs) {
      signalGroup.remove(arc.line);
      arc.line.geometry.dispose();
      arc.line.material.dispose();
    }
    arcs = [];
    if (signalGroup && scene) scene.remove(signalGroup);
    signalGroup = null;
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    update,
    addSpotArc,
    hitTest,
    setVisible,
    getArcCount,
    destroy,
    _getGroup: () => signalGroup
  });
})();

if (typeof window !== 'undefined') window.SignalRenderer = SignalRenderer;
