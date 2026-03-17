// ═══════════════════════════════════════════════════════════
// SKY OBJECT — Canonical Schema for the Celestial State Engine
// Constellation Journal: Phase 2 Architecture
// ═══════════════════════════════════════════════════════════
// Every renderable thing in the sky conforms to this contract.
// Factory functions enforce schema validity at creation time.
// ═══════════════════════════════════════════════════════════

const SkyObject = (() => {
  'use strict';

  // ── Layer classes ──
  const LAYER_CLASS = Object.freeze({
    REFERENCE: 'reference',   // HYG stars, Milky Way, nebula, constellations
    CELESTIAL: 'celestial',   // planets, ISS, NEOs, Sentry, solar weather
    PERSONAL:  'personal',    // journal entries, emotional constellations, prophecy
    SIGNAL:    'signal'       // WSPR, APRS, FT8 (Phase 3)
  });

  // ── Object types ──
  const TYPE = Object.freeze({
    // Reference
    CATALOG_STAR:    'catalog_star',
    DEEP_SKY:        'deep_sky',
    CONSTELLATION:   'constellation',

    // Celestial
    PLANET:          'planet',
    MOON:            'moon',
    SUN:             'sun',
    NEO:             'neo',
    ISS:             'iss',
    SENTRY_THREAT:   'sentry_threat',
    METEOR_SHOWER:   'meteor_shower',

    // Personal
    JOURNAL_ENTRY:   'journal_entry',
    PROPHECY:        'prophecy',
    MILESTONE:       'milestone',

    // Signal (Phase 3)
    WSPR_ARC:        'wspr_arc',
    APRS_STATION:    'aprs_station',
    FT8_CONTACT:     'ft8_contact'
  });

  // ── Coordinate systems ──
  const COORD = Object.freeze({
    RA_DEC:     'ra_dec',       // { ra (hours), dec (degrees), dist (AU or km) }
    CARTESIAN:  'cartesian',    // { x, y, z }
    GEODETIC:   'geodetic',     // { lat, lon, alt }
    SPHERICAL:  'spherical'     // { theta, phi, radius }
  });

  // ── Motion types ──
  const MOTION = Object.freeze({
    STATIC:     'static',       // fixed forever (stars, constellations)
    ORBITAL:    'orbital',      // computed from elements (planets)
    REALTIME:   'realtime',     // fetched live (ISS, APRS)
    PULSING:    'pulsing',      // animated opacity/size (NEOs, halos)
    TRANSIENT:  'transient'     // exists for a time window then vanishes
  });

  // ── Visual shapes ──
  const SHAPE = Object.freeze({
    SPRITE:  'sprite',
    POINT:   'point',
    LINE:    'line',
    ARC:     'arc',
    RING:    'ring',
    MESH:    'mesh',
    TRAIL:   'trail',
    STREAK:  'streak'   // meteor streaks
  });

  // ═══════════════════════════════════════════════════════════
  // SCHEMA VALIDATION
  // ═══════════════════════════════════════════════════════════

  function validate(obj) {
    const errors = [];
    if (!obj.id)    errors.push('missing id');
    if (!obj.type)  errors.push('missing type');
    if (!obj.layer) errors.push('missing layer');
    if (!obj.position) errors.push('missing position');
    if (!obj.visual)   errors.push('missing visual');
    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  }

  // ═══════════════════════════════════════════════════════════
  // BASE CREATOR
  // ═══════════════════════════════════════════════════════════

  function create(fields) {
    const obj = {
      id:          fields.id || `sky_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type:        fields.type,
      layer:       fields.layer,
      coordSystem: fields.coordSystem || COORD.RA_DEC,
      position:    fields.position,
      visual: {
        shape:    fields.visual?.shape    || SHAPE.SPRITE,
        color:    fields.visual?.color    ?? 0xFFFFFF,
        size:     fields.visual?.size     ?? 1.0,
        opacity:  fields.visual?.opacity  ?? 1.0,
        blending: fields.visual?.blending || 'additive'
      },
      metadata:    fields.metadata || {},
      motion:      fields.motion || MOTION.STATIC,
      timeWindow:  fields.timeWindow || null,
      interaction: {
        hoverable:  fields.interaction?.hoverable ?? true,
        clickable:  fields.interaction?.clickable ?? false,
        tooltipFn:  fields.interaction?.tooltipFn || null
      },
      // Internal — set by layer manager
      _threeObject: null,
      _layerId: null
    };

    const result = validate(obj);
    if (!result.valid) {
      console.error('SkyObject validation failed:', result.errors, fields);
      return null;
    }
    return obj;
  }

  // ═══════════════════════════════════════════════════════════
  // FACTORY FUNCTIONS — Celestial
  // ═══════════════════════════════════════════════════════════

  function planet(name, ra, dec, dist, metadata = {}) {
    return create({
      id: `planet_${name}`,
      type: TYPE.PLANET,
      layer: 'celestial-planets',
      coordSystem: COORD.RA_DEC,
      position: { ra, dec, dist },
      visual: {
        shape: SHAPE.SPRITE,
        color: metadata.color || 0xFFFFFF,
        size: metadata.size || 3.0,
        opacity: metadata.glow || 0.9,
        blending: 'additive'
      },
      metadata: { label: metadata.label || name, ...metadata },
      motion: MOTION.ORBITAL,
      interaction: {
        hoverable: true,
        clickable: true,
        tooltipFn: (obj) => ({
          name: obj.metadata.label,
          detail: `${obj.position.dist.toFixed(3)} AU`,
          sub: `RA ${obj.position.ra.toFixed(2)}h · Dec ${obj.position.dec.toFixed(1)}°`
        })
      }
    });
  }

  function neo(id, name, missDistance, hazardous, metadata = {}) {
    const lunarDist = missDistance.lunar || 0;
    let color;
    if (lunarDist > 5) color = 0xE6CC4D;        // gold
    else if (lunarDist > 1) color = 0xFF9919;    // orange
    else if (lunarDist > 0.5) color = 0xFF4D00;  // orange-red
    else color = 0xFF1919;                        // red
    if (hazardous) color = 0xFF3300;

    return create({
      id: `neo_${id}`,
      type: TYPE.NEO,
      layer: 'celestial-neos',
      coordSystem: COORD.RA_DEC,
      position: { ra: metadata.ra || 0, dec: metadata.dec || 0, dist: missDistance.au || 0 },
      visual: {
        shape: SHAPE.POINT,
        color,
        size: hazardous ? 2.0 : 1.2,
        opacity: 0.6,
        blending: 'additive'
      },
      metadata: {
        name,
        hazardous,
        missDistanceLunar: lunarDist,
        missDistanceKm: missDistance.km || 0,
        velocity: metadata.velocity || 0,
        diameter: metadata.diameter || 0,
        closeApproachDate: metadata.closeApproachDate || '',
        ...metadata
      },
      motion: MOTION.PULSING,
      timeWindow: metadata.closeApproachDate ? {
        start: new Date(metadata.closeApproachDate),
        end: new Date(new Date(metadata.closeApproachDate).getTime() + 7 * 86400000)
      } : null,
      interaction: {
        hoverable: true,
        clickable: true,
        tooltipFn: (obj) => ({
          name: `${obj.metadata.hazardous ? '⚠ ' : ''}${obj.metadata.name}`,
          detail: `${obj.metadata.missDistanceLunar.toFixed(1)} lunar distances`,
          sub: `${obj.metadata.velocity.toFixed(1)} km/s · ${obj.metadata.closeApproachDate}`
        })
      }
    });
  }

  function iss(lat, lon, ra, dec, metadata = {}) {
    return create({
      id: 'iss',
      type: TYPE.ISS,
      layer: 'celestial-iss',
      coordSystem: COORD.RA_DEC,
      position: { ra, dec, dist: 0.00003 }, // ~420 km in AU
      visual: {
        shape: SHAPE.SPRITE,
        color: 0xCCDDFF,
        size: 4.0,
        opacity: 0.9,
        blending: 'additive'
      },
      metadata: { lat, lon, altitude: 420, velocity: 7.66, ...metadata },
      motion: MOTION.REALTIME,
      interaction: {
        hoverable: true,
        clickable: true,
        tooltipFn: (obj) => ({
          name: '🛰 ISS',
          detail: `Lat ${obj.metadata.lat.toFixed(1)}° · Lon ${obj.metadata.lon.toFixed(1)}°`,
          sub: `Alt: ${obj.metadata.altitude} km · ${obj.metadata.velocity} km/s`
        })
      }
    });
  }

  function sentryThreat(designation, name, torino, palermo, impactProb, metadata = {}) {
    let color;
    if (torino === 0)      color = 0xBB9933;
    else if (torino <= 3)  color = 0x44CC66;
    else if (torino <= 7)  color = 0xFFAA00;
    else                   color = 0xFF3300;

    return create({
      id: `sentry_${designation}`,
      type: TYPE.SENTRY_THREAT,
      layer: 'celestial-sentry',
      coordSystem: COORD.RA_DEC,
      position: { ra: metadata.ra || 0, dec: metadata.dec || 0, dist: 0 },
      visual: {
        shape: SHAPE.RING,
        color,
        size: 1.4,
        opacity: 0.55,
        blending: 'additive'
      },
      metadata: { designation, name, torino, palermo, impactProb, ...metadata },
      motion: MOTION.PULSING,
      interaction: {
        hoverable: true,
        clickable: true,
        tooltipFn: (obj) => ({
          name: `⚠ ${obj.metadata.name || obj.metadata.designation}`,
          detail: `Torino: ${obj.metadata.torino} · Palermo: ${obj.metadata.palermo?.toFixed(2)}`,
          sub: `Impact prob: ${obj.metadata.impactProb?.toExponential(2)}`
        })
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FACTORY FUNCTIONS — Personal
  // ═══════════════════════════════════════════════════════════

  function journalEntry(dayIndex, date, emotion, text, metadata = {}) {
    // Emotional temperature → star color
    const emotionColors = {
      joy:        0xFFDD44,
      calm:       0x88BBFF,
      sadness:    0x6666CC,
      anger:      0xFF4422,
      fear:       0x994488,
      love:       0xFF88AA,
      hope:       0xAAFFAA,
      nostalgia:  0xDDBB88,
      neutral:    0xCCCCDD
    };

    const color = emotionColors[emotion] || emotionColors.neutral;
    const textLen = (text || '').length;
    const size = Math.min(8, Math.max(3, 3 + textLen / 200)); // 3-8 based on length

    return create({
      id: `journal_${dayIndex}_${date}`,
      type: TYPE.JOURNAL_ENTRY,
      layer: 'personal-journal',
      coordSystem: COORD.SPHERICAL,
      position: { theta: 0, phi: 0, radius: 50 }, // set by Fibonacci placement
      visual: {
        shape: SHAPE.POINT,
        color,
        size,
        opacity: 0.9,
        blending: 'additive'
      },
      metadata: {
        dayIndex,
        date,
        emotion,
        textPreview: (text || '').slice(0, 100),
        textLength: textLen,
        ...metadata
      },
      motion: MOTION.STATIC,
      timeWindow: { start: new Date(date), end: null }, // persists forever once created
      interaction: {
        hoverable: true,
        clickable: true,
        tooltipFn: (obj) => ({
          name: `Day ${obj.metadata.dayIndex + 1}`,
          detail: obj.metadata.date,
          sub: obj.metadata.emotion || ''
        })
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FACTORY FUNCTIONS — Signal (Phase 3 prep)
  // ═══════════════════════════════════════════════════════════

  function wsprArc(sender, receiver, freq, snr, metadata = {}) {
    return create({
      id: `wspr_${sender}_${receiver}_${Date.now()}`,
      type: TYPE.WSPR_ARC,
      layer: 'signal-wspr',
      coordSystem: COORD.GEODETIC,
      position: { lat: metadata.senderLat || 0, lon: metadata.senderLon || 0, alt: 0 },
      visual: {
        shape: SHAPE.ARC,
        color: 0x44EEFF,
        size: 1.0,
        opacity: 0.4,
        blending: 'additive'
      },
      metadata: {
        sender, receiver, freq, snr,
        receiverLat: metadata.receiverLat || 0,
        receiverLon: metadata.receiverLon || 0,
        band: metadata.band || '',
        ...metadata
      },
      motion: MOTION.TRANSIENT,
      timeWindow: {
        start: new Date(),
        end: new Date(Date.now() + 3600000) // 1 hour TTL
      },
      interaction: {
        hoverable: true,
        clickable: false,
        tooltipFn: (obj) => ({
          name: `WSPR · ${obj.metadata.band || obj.metadata.freq}`,
          detail: `${obj.metadata.sender} → ${obj.metadata.receiver}`,
          sub: `SNR: ${obj.metadata.snr} dB`
        })
      }
    });
  }

  function aprsStation(callsign, lat, lon, metadata = {}) {
    return create({
      id: `aprs_${callsign}`,
      type: TYPE.APRS_STATION,
      layer: 'signal-aprs',
      coordSystem: COORD.GEODETIC,
      position: { lat, lon, alt: 0 },
      visual: {
        shape: SHAPE.SPRITE,
        color: 0x66FF88,
        size: 1.5,
        opacity: 0.6,
        blending: 'additive'
      },
      metadata: { callsign, ...metadata },
      motion: MOTION.REALTIME,
      interaction: {
        hoverable: true,
        clickable: false,
        tooltipFn: (obj) => ({
          name: `📡 ${obj.metadata.callsign}`,
          detail: `Lat ${obj.position.lat.toFixed(2)}° Lon ${obj.position.lon.toFixed(2)}°`,
          sub: ''
        })
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    // Enums
    LAYER_CLASS,
    TYPE,
    COORD,
    MOTION,
    SHAPE,

    // Core
    create,
    validate,

    // Factories — Celestial
    planet,
    neo,
    iss,
    sentryThreat,

    // Factories — Personal
    journalEntry,

    // Factories — Signal (Phase 3)
    wsprArc,
    aprsStation
  });
})();

if (typeof window !== 'undefined') window.SkyObject = SkyObject;
