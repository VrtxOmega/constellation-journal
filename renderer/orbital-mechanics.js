// ═══════════════════════════════════════════════════════════
// ORBITAL MECHANICS ENGINE — Client-side Keplerian Solver
// Constellation Journal: Near-Earth Celestial Tracker
// ═══════════════════════════════════════════════════════════
// Domain: Computes positions (RA/Dec) for solar system bodies
// Invariant: All angles in radians internally, degrees at API boundary
// Invariant: All distances in AU internally
// Invariant: Time as Julian Date (JD) internally, JS Date at API boundary
// No external dependencies. Pure math.
// ═══════════════════════════════════════════════════════════

const OrbitalMechanics = (() => {
  'use strict';

  // ── Constants ──
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const TWO_PI = 2 * Math.PI;
  const OBLIQUITY_J2000 = 23.4392911 * DEG2RAD; // Earth's axial tilt at J2000.0
  const J2000 = 2451545.0; // Julian Date of J2000.0 epoch (2000-01-01T12:00:00 TT)
  const AU_KM = 149597870.7;

  // ── Julian Date Conversion ──
  // Domain: JS Date → Real (JD)
  // Total: true for all valid JS Date objects
  function julianDate(date) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    let Y = y, M = m;
    if (M <= 2) { Y -= 1; M += 12; }

    const A = Math.floor(Y / 100);
    const B = 2 - A + Math.floor(A / 4);

    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + h / 24 + B - 1524.5;
  }

  // ── Centuries since J2000.0 ──
  function centuriesSinceJ2000(jd) {
    return (jd - J2000) / 36525.0;
  }

  // ── Normalize angle to [0, 2π) ──
  function normalizeAngle(a) {
    a = a % TWO_PI;
    if (a < 0) a += TWO_PI;
    return a;
  }

  // ═══════════════════════════════════════════════════════════
  // MEAN ORBITAL ELEMENTS — J2000.0 + secular rates
  // Source: Meeus "Astronomical Algorithms", JPL
  // Domain: T in Julian centuries since J2000.0
  // Each returns { a, e, i, L, longPeri, longNode }
  //   a = semi-major axis (AU)
  //   e = eccentricity
  //   i = inclination (deg)
  //   L = mean longitude (deg)
  //   longPeri = longitude of perihelion (deg)
  //   longNode = longitude of ascending node (deg)
  // ═══════════════════════════════════════════════════════════

  const PLANET_ELEMENTS = {
    mercury: {
      a:  [0.38709927,  0.00000037],
      e:  [0.20563593,  0.00001906],
      i:  [7.00497902, -0.00594749],
      L:  [252.25032350, 149472.67411175],
      longPeri: [77.45779628,  0.16047689],
      longNode: [48.33076593, -0.12534081]
    },
    venus: {
      a:  [0.72333566,  0.00000390],
      e:  [0.00677672, -0.00004107],
      i:  [3.39467605, -0.00078890],
      L:  [181.97909950, 58517.81538729],
      longPeri: [131.60246718, 0.00268329],
      longNode: [76.67984255, -0.27769418]
    },
    earth: {
      a:  [1.00000261,  0.00000562],
      e:  [0.01671123, -0.00004392],
      i:  [-0.00001531, -0.01294668],
      L:  [100.46457166, 35999.37244981],
      longPeri: [102.93768193, 0.32327364],
      longNode: [0.0, 0.0]
    },
    mars: {
      a:  [1.52371034,  0.00001847],
      e:  [0.09339410,  0.00007882],
      i:  [1.84969142, -0.00813131],
      L:  [-4.55343205, 19140.30268499],
      longPeri: [-23.94362959, 0.44441088],
      longNode: [49.55953891, -0.29257343]
    },
    jupiter: {
      a:  [5.20288700, -0.00011607],
      e:  [0.04838624, -0.00013253],
      i:  [1.30439695, -0.00183714],
      L:  [34.39644051, 3034.74612775],
      longPeri: [14.72847983, 0.21252668],
      longNode: [100.47390909, 0.20469106]
    },
    saturn: {
      a:  [9.53667594, -0.00125060],
      e:  [0.05386179, -0.00050991],
      i:  [2.48599187,  0.00193609],
      L:  [49.95424423, 1222.49362201],
      longPeri: [92.59887831, -0.41897216],
      longNode: [113.66242448, -0.28867794]
    },
    uranus: {
      a:  [19.18916464, -0.00196176],
      e:  [0.04725744, -0.00004397],
      i:  [0.77263783, -0.00242939],
      L:  [313.23810451, 428.48202785],
      longPeri: [170.95427630, 0.40805281],
      longNode: [74.01692503, 0.04240589]
    },
    neptune: {
      a:  [30.06992276,  0.00026291],
      e:  [0.00859048,  0.00005105],
      i:  [1.77004347,  0.00035372],
      L:  [-55.12002969, 218.45945325],
      longPeri: [44.96476227, -0.32241464],
      longNode: [131.78422574, -0.00508664]
    },
    pluto: {
      a:  [39.48211675, -0.00031596],
      e:  [0.24882730,  0.00005170],
      i:  [17.14001206,  0.00004818],
      L:  [238.92903833, 145.20780515],
      longPeri: [224.06891629, -0.04062942],
      longNode: [110.30393684, -0.01183482]
    }
  };

  // ── Compute elements at time T (centuries since J2000) ──
  function getElements(name, T) {
    const el = PLANET_ELEMENTS[name];
    if (!el) return null;
    return {
      a:        el.a[0]        + el.a[1]        * T,
      e:        el.e[0]        + el.e[1]        * T,
      i:       (el.i[0]        + el.i[1]        * T) * DEG2RAD,
      L:       (el.L[0]        + el.L[1]        * T) * DEG2RAD,
      longPeri:(el.longPeri[0] + el.longPeri[1] * T) * DEG2RAD,
      longNode:(el.longNode[0] + el.longNode[1] * T) * DEG2RAD
    };
  }

  // ═══════════════════════════════════════════════════════════
  // KEPLER'S EQUATION SOLVER
  // Domain: M (mean anomaly, rad), e (eccentricity, [0,1))
  // Codomain: E (eccentric anomaly, rad)
  // Method: Newton-Raphson, max 30 iterations, |delta| < 1e-12
  // ═══════════════════════════════════════════════════════════
  function solveKepler(M, e) {
    M = normalizeAngle(M);
    let E = M; // initial guess
    for (let iter = 0; iter < 30; iter++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  }

  // ═══════════════════════════════════════════════════════════
  // HELIOCENTRIC POSITION (ecliptic)
  // Returns { x, y, z } in AU, heliocentric ecliptic J2000
  // ═══════════════════════════════════════════════════════════
  function heliocentricEcliptic(name, jd) {
    const T = centuriesSinceJ2000(jd);
    const el = getElements(name, T);
    if (!el) return null;

    const M = normalizeAngle(el.L - el.longPeri); // mean anomaly
    const E = solveKepler(M, el.e);

    // True anomaly
    const sinV = Math.sqrt(1 - el.e * el.e) * Math.sin(E) / (1 - el.e * Math.cos(E));
    const cosV = (Math.cos(E) - el.e) / (1 - el.e * Math.cos(E));
    const v = Math.atan2(sinV, cosV);

    // Distance from Sun
    const r = el.a * (1 - el.e * Math.cos(E));

    // Argument of perihelion
    const omega = el.longPeri - el.longNode;

    // Position in orbital plane
    const cosOmega = Math.cos(omega + v);
    const sinOmega = Math.sin(omega + v);

    // Rotate to ecliptic
    const cosNode = Math.cos(el.longNode);
    const sinNode = Math.sin(el.longNode);
    const cosI = Math.cos(el.i);
    const sinI = Math.sin(el.i);

    const x = r * (cosNode * cosOmega - sinNode * sinOmega * cosI);
    const y = r * (sinNode * cosOmega + cosNode * sinOmega * cosI);
    const z = r * (sinOmega * sinI);

    return { x, y, z, r, v, name };
  }

  // ═══════════════════════════════════════════════════════════
  // GEOCENTRIC EQUATORIAL (RA/Dec)
  // Converts heliocentric ecliptic to geocentric RA/Dec
  // ═══════════════════════════════════════════════════════════
  function helioToGeo(planet, earth) {
    // Geocentric ecliptic
    const gx = planet.x - earth.x;
    const gy = planet.y - earth.y;
    const gz = planet.z - earth.z;

    // Ecliptic to equatorial (rotate by obliquity)
    const cosE = Math.cos(OBLIQUITY_J2000);
    const sinE = Math.sin(OBLIQUITY_J2000);
    const eqX = gx;
    const eqY = gy * cosE - gz * sinE;
    const eqZ = gy * sinE + gz * cosE;

    // RA/Dec
    const dist = Math.sqrt(eqX * eqX + eqY * eqY + eqZ * eqZ);
    const dec = Math.asin(eqZ / dist);
    let ra = Math.atan2(eqY, eqX);
    if (ra < 0) ra += TWO_PI;

    return {
      ra: ra * RAD2DEG / 15, // hours
      dec: dec * RAD2DEG,     // degrees
      dist: dist,             // AU
      name: planet.name
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Get planet RA/Dec at a given JS Date
  // ═══════════════════════════════════════════════════════════
  function getPlanetPosition(name, date) {
    const jd = julianDate(date || new Date());
    const earth = heliocentricEcliptic('earth', jd);
    if (name === 'earth') return { ra: 0, dec: 0, dist: 0, name: 'earth' };
    const planet = heliocentricEcliptic(name, jd);
    if (!planet || !earth) return null;
    return helioToGeo(planet, earth);
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Get ALL planet positions at a given JS Date
  // ═══════════════════════════════════════════════════════════
  function getAllPlanetPositions(date) {
    const jd = julianDate(date || new Date());
    const earth = heliocentricEcliptic('earth', jd);
    const names = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    const results = [];
    for (const name of names) {
      const planet = heliocentricEcliptic(name, jd);
      if (planet && earth) {
        results.push(helioToGeo(planet, earth));
      }
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Moon position (simplified Brown theory)
  // Accuracy: ~1° in longitude, ~0.5° in latitude
  // ═══════════════════════════════════════════════════════════
  function getMoonPosition(date) {
    const jd = julianDate(date || new Date());
    const T = centuriesSinceJ2000(jd);

    // Mean elements (degrees)
    const L0 = 218.3164477 + 481267.88123421 * T; // mean longitude
    const M  = 134.9633964 + 477198.8675055  * T;  // mean anomaly
    const Ms = 357.5291092 + 35999.0502909   * T;  // Sun mean anomaly
    const D  = 297.8501921 + 445267.1114034  * T;  // mean elongation
    const F  = 93.2720950  + 483202.0175233  * T;  // argument of latitude

    const Lr = L0 * DEG2RAD;
    const Mr = M * DEG2RAD;
    const Msr = Ms * DEG2RAD;
    const Dr = D * DEG2RAD;
    const Fr = F * DEG2RAD;

    // Longitude corrections (largest terms)
    let lon = L0
      + 6.288774  * Math.sin(Mr)
      + 1.274027  * Math.sin(2 * Dr - Mr)
      + 0.658314  * Math.sin(2 * Dr)
      + 0.213618  * Math.sin(2 * Mr)
      - 0.185116  * Math.sin(Msr)
      - 0.114332  * Math.sin(2 * Fr)
      + 0.058793  * Math.sin(2 * Dr - 2 * Mr)
      + 0.057066  * Math.sin(2 * Dr - Msr - Mr)
      + 0.053322  * Math.sin(2 * Dr + Mr);

    // Latitude
    let lat = 5.128122  * Math.sin(Fr)
      + 0.280602  * Math.sin(Mr + Fr)
      + 0.277693  * Math.sin(Mr - Fr)
      + 0.173237  * Math.sin(2 * Dr - Fr)
      + 0.055413  * Math.sin(2 * Dr - Mr + Fr)
      + 0.046271  * Math.sin(2 * Dr - Mr - Fr);

    // Distance (km)
    let dist = 385000.56
      - 20905.355 * Math.cos(Mr)
      - 3699.111  * Math.cos(2 * Dr - Mr)
      - 2955.968  * Math.cos(2 * Dr)
      - 569.925   * Math.cos(2 * Mr);

    // Ecliptic to equatorial
    const lonR = lon * DEG2RAD;
    const latR = lat * DEG2RAD;
    const cosE = Math.cos(OBLIQUITY_J2000);
    const sinE = Math.sin(OBLIQUITY_J2000);

    const ra = Math.atan2(
      Math.sin(lonR) * cosE - Math.tan(latR) * sinE,
      Math.cos(lonR)
    );
    const dec = Math.asin(
      Math.sin(latR) * cosE + Math.cos(latR) * sinE * Math.sin(lonR)
    );

    let raH = (ra * RAD2DEG / 15);
    if (raH < 0) raH += 24;

    // Moon phase (0=new, 0.5=full, 1=new again)
    const phase = (1 - Math.cos((lon - (L0 + Ms * 0)) * DEG2RAD)) / 2;
    // Simplified: use elongation
    const elongation = normalizeAngle(D * DEG2RAD);
    const illumination = (1 - Math.cos(elongation)) / 2;

    return {
      ra: raH,
      dec: dec * RAD2DEG,
      dist: dist / AU_KM, // AU
      distKm: dist,
      illumination: illumination,
      name: 'moon'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Sun position (for reference/rendering)
  // ═══════════════════════════════════════════════════════════
  function getSunPosition(date) {
    const jd = julianDate(date || new Date());
    const T = centuriesSinceJ2000(jd);

    // Mean longitude and anomaly
    const L0 = (280.46646 + 36000.76983 * T) * DEG2RAD;
    const M  = (357.52911 + 35999.05029 * T) * DEG2RAD;

    // Equation of center
    const C = (1.914602 - 0.004817 * T) * Math.sin(M)
            + 0.019993 * Math.sin(2 * M)
            + 0.000289 * Math.sin(3 * M);

    const sunLon = (L0 + C * DEG2RAD);

    // Ecliptic to equatorial
    const cosE = Math.cos(OBLIQUITY_J2000);
    const sinE = Math.sin(OBLIQUITY_J2000);

    const ra = Math.atan2(cosE * Math.sin(sunLon), Math.cos(sunLon));
    const dec = Math.asin(sinE * Math.sin(sunLon));

    let raH = ra * RAD2DEG / 15;
    if (raH < 0) raH += 24;

    return {
      ra: raH,
      dec: dec * RAD2DEG,
      dist: 1.0, // ~1 AU
      name: 'sun'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: RA/Dec to Cartesian (for Three.js sphere)
  // Maps equatorial coords to a point on a sphere of given radius
  // RA in hours [0,24), Dec in degrees [-90,90]
  // ═══════════════════════════════════════════════════════════
  function raDec2Cartesian(raHours, decDeg, radius) {
    const ra = raHours * 15 * DEG2RAD;   // hours → degrees → radians
    const dec = decDeg * DEG2RAD;
    const x = radius * Math.cos(dec) * Math.cos(ra);
    const y = radius * Math.sin(dec);
    const z = -radius * Math.cos(dec) * Math.sin(ra); // negative for right-hand sky convention
    return { x, y, z };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Planet visual properties
  // ═══════════════════════════════════════════════════════════
  const PLANET_VISUALS = {
    sun:     { color: 0xFFDD44, size: 8, glow: 1.0, label: 'Sun' },
    moon:    { color: 0xE8E8D0, size: 6, glow: 0.8, label: 'Moon' },
    mercury: { color: 0xBBBBBB, size: 2.5, glow: 0.4, label: 'Mercury' },
    venus:   { color: 0xFFEECC, size: 3.5, glow: 0.6, label: 'Venus' },
    mars:    { color: 0xFF6644, size: 3.0, glow: 0.5, label: 'Mars' },
    jupiter: { color: 0xFFCC88, size: 4.5, glow: 0.7, label: 'Jupiter' },
    saturn:  { color: 0xFFDD99, size: 4.0, glow: 0.6, label: 'Saturn' },
    uranus:  { color: 0x88CCDD, size: 3.0, glow: 0.4, label: 'Uranus' },
    neptune: { color: 0x4488FF, size: 3.0, glow: 0.4, label: 'Neptune' },
    pluto:   { color: 0xCCBBAA, size: 2.0, glow: 0.3, label: 'Pluto' }
  };

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════
  return {
    julianDate,
    getPlanetPosition,
    getAllPlanetPositions,
    getMoonPosition,
    getSunPosition,
    raDec2Cartesian,
    PLANET_VISUALS,
    PLANET_ELEMENTS,
    // Internals exposed for testing
    _solveKepler: solveKepler,
    _heliocentricEcliptic: heliocentricEcliptic,
    _normalizeAngle: normalizeAngle,
    _centuriesSinceJ2000: centuriesSinceJ2000,
    DEG2RAD,
    RAD2DEG
  };
})();

// Make available to other scripts
if (typeof window !== 'undefined') window.OrbitalMechanics = OrbitalMechanics;
if (typeof module !== 'undefined') module.exports = OrbitalMechanics;
