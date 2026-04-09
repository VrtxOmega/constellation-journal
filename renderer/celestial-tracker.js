// ═══════════════════════════════════════════════════════════
// CELESTIAL TRACKER — API Data Layer
// Constellation Journal: Near-Earth Celestial Tracker
// ═══════════════════════════════════════════════════════════
// Fetches and caches data from NASA/JPL public APIs:
//   - NeoWs (near-Earth objects)
//   - CNEOS Sentry (impact risk)
//   - SBDB CAD (close approach data)
//   - DONKI (solar weather)
//   - ISS position (real-time)
// Falls back to cached data on network failure.
// ═══════════════════════════════════════════════════════════

const CelestialTracker = (() => {
  'use strict';

  // ── Config ──
  const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY'; // works without registration, 30 req/hr
  const REFRESH_INTERVALS = {
    neos:     4 * 3600 * 1000,  // 4 hours
    sentry:  24 * 3600 * 1000,  // 24 hours
    cad:     12 * 3600 * 1000,  // 12 hours
    donki:    1 * 3600 * 1000,  // 1 hour
    iss:         5 * 1000,      // 5 seconds
    planets:  6 * 3600 * 1000   // 6 hours (for Horizons cross-check)
  };

  // ── State ──
  const cache = {
    neos: { data: [], updatedAt: 0 },
    sentry: { data: [], updatedAt: 0 },
    cad: { data: [], updatedAt: 0 },
    donki: { data: { cmes: [], flares: [], storms: [] }, updatedAt: 0 },
    iss: { data: null, updatedAt: 0 },
    planets: { data: [], updatedAt: 0 }
  };

  let enabled = false;
  let issIntervalId = null;
  let mainIntervalId = null;

  // ═══════════════════════════════════════════════════════════
  // FETCH HELPERS
  // ═══════════════════════════════════════════════════════════

  async function safeFetch(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      clearTimeout(id);
      return null;
    }
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function futureStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ═══════════════════════════════════════════════════════════
  // NASA NeoWs — Near Earth Objects
  // Domain: date range → list of NEOs with close approach data
  // ═══════════════════════════════════════════════════════════
  async function fetchNEOs() {
    const start = todayStr();
    const end = futureStr(7);
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${NASA_API_KEY}`;
    const data = await safeFetch(url, 15000);
    if (!data || !data.near_earth_objects) return;

    const neos = [];
    for (const [date, objects] of Object.entries(data.near_earth_objects)) {
      for (const obj of objects) {
        const ca = obj.close_approach_data && obj.close_approach_data[0];
        if (!ca) continue;

        neos.push({
          id: obj.id,
          name: obj.name,
          nasaUrl: obj.nasa_jpl_url,
          isPotentiallyHazardous: obj.is_potentially_hazardous_asteroid,
          diameterMin: obj.estimated_diameter?.kilometers?.estimated_diameter_min || 0,
          diameterMax: obj.estimated_diameter?.kilometers?.estimated_diameter_max || 0,
          closeApproachDate: ca.close_approach_date_full || ca.close_approach_date,
          velocity: parseFloat(ca.relative_velocity?.kilometers_per_second || 0),
          missDistanceKm: parseFloat(ca.miss_distance?.kilometers || 0),
          missDistanceLunar: parseFloat(ca.miss_distance?.lunar || 0),
          missDistanceAU: parseFloat(ca.miss_distance?.astronomical || 0),
          orbitingBody: ca.orbiting_body
        });
      }
    }

    // Sort by miss distance (closest first)
    neos.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
    cache.neos = { data: neos, updatedAt: Date.now() };
  }

  // ═══════════════════════════════════════════════════════════
  // CNEOS Sentry — Impact Risk Assessment
  // Domain: → list of objects with impact probability
  // ═══════════════════════════════════════════════════════════
  async function fetchSentry() {
    const url = 'https://ssd-api.jpl.nasa.gov/sentry.api';
    const data = await safeFetch(url, 15000);
    if (!data || !data.data) return;

    const objects = data.data.map(obj => ({
      designation: obj.des,
      name: obj.fullname || obj.des,
      nObs: parseInt(obj.n_obs) || 0,
      lastObs: obj.last_obs,
      impactProbability: parseFloat(obj.ip) || 0,
      palermoMax: parseFloat(obj.ps_max) || -Infinity,
      palermoCum: parseFloat(obj.ps_cum) || -Infinity,
      torinoMax: parseInt(obj.ts_max) || 0,
      diameterKm: parseFloat(obj.diameter) || 0,
      vInf: parseFloat(obj.v_inf) || 0, // km/s at infinity
      nImpacts: parseInt(obj.n_imp) || 0,
      yearStart: parseInt(obj.range?.split?.('-')?.[0]) || 0,
      yearEnd: parseInt(obj.range?.split?.('-')?.[1]) || 0
    }));

    // Sort by Palermo scale (highest threat first)
    objects.sort((a, b) => b.palermoCum - a.palermoCum);
    cache.sentry = { data: objects, updatedAt: Date.now() };
  }

  // ═══════════════════════════════════════════════════════════
  // SBDB Close Approach Data
  // Domain: → list of close approaches within 60 days
  // ═══════════════════════════════════════════════════════════
  async function fetchCAD() {
    const start = todayStr();
    const end = futureStr(60);
    const url = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${start}&date-max=${end}&dist-max=0.2&sort=dist`;
    const data = await safeFetch(url, 15000);
    if (!data || !data.data) return;

    const fields = data.fields; // column names
    const approaches = data.data.map(row => {
      const obj = {};
      fields.forEach((f, i) => obj[f] = row[i]);
      return {
        designation: obj.des,
        closeApproachDate: obj.cd,
        distanceAU: parseFloat(obj.dist) || 0,
        distanceMinAU: parseFloat(obj.dist_min) || 0,
        velocityRelative: parseFloat(obj.v_rel) || 0, // km/s
        velocityInf: parseFloat(obj.v_inf) || 0,
        diameterStr: obj.diameter || 'unknown',
        hMag: parseFloat(obj.h) || 0,
        body: obj.body || 'Earth'
      };
    });

    cache.cad = { data: approaches, updatedAt: Date.now() };
  }

  // ═══════════════════════════════════════════════════════════
  // DONKI — Space Weather
  // Domain: → active CMEs, flares, geomagnetic storms
  // ═══════════════════════════════════════════════════════════
  async function fetchDONKI() {
    const start = futureStr(-7);
    const end = todayStr();

    const [cmeData, flareData, stormData] = await Promise.all([
      safeFetch(`https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${NASA_API_KEY}`),
      safeFetch(`https://api.nasa.gov/DONKI/FLR?startDate=${start}&endDate=${end}&api_key=${NASA_API_KEY}`),
      safeFetch(`https://api.nasa.gov/DONKI/GST?startDate=${start}&endDate=${end}&api_key=${NASA_API_KEY}`)
    ]);

    const cmes = (cmeData || []).map(c => ({
      id: c.activityID,
      startTime: c.startTime,
      type: c.type || 'CME',
      note: c.note,
      isEarthDirected: (c.cmeAnalyses || []).some(a => a.isMostAccurate && a.type === 'S'), // simplified check
      speed: (c.cmeAnalyses || []).reduce((max, a) => Math.max(max, a.speed || 0), 0)
    }));

    const flares = (flareData || []).map(f => ({
      id: f.flrID,
      beginTime: f.beginTime,
      peakTime: f.peakTime,
      endTime: f.endTime,
      classType: f.classType, // e.g. "X1.3", "M5.2"
      sourceLocation: f.sourceLocation
    }));

    const storms = (stormData || []).map(s => ({
      id: s.gstID,
      startTime: s.startTime,
      kpIndex: (s.allKpIndex || []).reduce((max, k) => Math.max(max, parseFloat(k.kpIndex) || 0), 0)
    }));

    cache.donki = {
      data: { cmes, flares, storms },
      updatedAt: Date.now()
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ISS Position — Real-time
  // ═══════════════════════════════════════════════════════════
  async function fetchISS() {
    const data = await safeFetch('http://api.open-notify.org/iss-now.json', 3000);
    if (!data || data.message !== 'success') return;

    const lat = parseFloat(data.iss_position.latitude);
    const lon = parseFloat(data.iss_position.longitude);

    // Convert lat/lon to approximate RA/Dec
    // ISS altitude ~420km, Earth radius ~6371km
    // For a ground observer, ISS RA ≈ local sidereal time adjusted
    // Simplified: use geographic coordinates as proxy for sky position
    // More accurate: compute from orbital TLE, but this is smooth enough
    const now = new Date();
    const gmst = getGMST(now);

    // RA = GMST + longitude (in hours)
    let raH = (gmst + lon / 15) % 24;
    if (raH < 0) raH += 24;
    const dec = lat; // approximate for LEO objects

    cache.iss = {
      data: { lat, lon, ra: raH, dec, altitude: 420, velocity: 7.66 },
      updatedAt: Date.now()
    };
  }

  // Greenwich Mean Sidereal Time (hours)
  function getGMST(date) {
    const jd = window.OrbitalMechanics ? window.OrbitalMechanics.julianDate(date) : julianDateFallback(date);
    const T = (jd - 2451545.0) / 36525.0;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
             + 0.000387933 * T * T - T * T * T / 38710000;
    gmst = ((gmst % 360) + 360) % 360;
    return gmst / 15; // hours
  }

  function julianDateFallback(date) {
    return (date.getTime() / 86400000) + 2440587.5;
  }

  // ═══════════════════════════════════════════════════════════
  // PLANET POSITIONS (from orbital mechanics engine)
  // ═══════════════════════════════════════════════════════════
  function updatePlanets() {
    if (!window.OrbitalMechanics) return;
    const now = new Date();
    const planets = window.OrbitalMechanics.getAllPlanetPositions(now);
    const moon = window.OrbitalMechanics.getMoonPosition(now);
    const sun = window.OrbitalMechanics.getSunPosition(now);
    cache.planets = {
      data: [...planets, moon, sun],
      updatedAt: Date.now()
    };
  }

  // ═══════════════════════════════════════════════════════════
  // REFRESH LOGIC
  // ═══════════════════════════════════════════════════════════
  function needsRefresh(key) {
    return (Date.now() - cache[key].updatedAt) > REFRESH_INTERVALS[key];
  }

  async function refreshAll() {
    if (!enabled) return;

    // Planets always compute locally (instant)
    updatePlanets();

    // API fetches only when stale
    const tasks = [];
    if (needsRefresh('neos'))   tasks.push(fetchNEOs().catch(() => {}));
    if (needsRefresh('sentry')) tasks.push(fetchSentry().catch(() => {}));
    if (needsRefresh('cad'))    tasks.push(fetchCAD().catch(() => {}));
    if (needsRefresh('donki'))  tasks.push(fetchDONKI().catch(() => {}));

    if (tasks.length > 0) await Promise.all(tasks);
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  async function init() {
    enabled = true;
    updatePlanets();
    await refreshAll();

    // ISS polling (5s)
    issIntervalId = setInterval(() => {
      if (enabled) fetchISS().catch(() => {});
    }, REFRESH_INTERVALS.iss);

    // Main refresh (check every 5 min)
    mainIntervalId = setInterval(() => {
      if (enabled) refreshAll();
    }, 5 * 60 * 1000);
  }

  function destroy() {
    enabled = false;
    if (issIntervalId) clearInterval(issIntervalId);
    if (mainIntervalId) clearInterval(mainIntervalId);
  }

  function toggle() {
    if (enabled) {
      destroy();
    } else {
      init();
    }
    return enabled;
  }

  function isEnabled() { return enabled; }

  // Getters
  function getPlanets()  { return cache.planets.data; }
  function getNEOs()     { return cache.neos.data; }
  function getSentry()   { return cache.sentry.data; }
  function getCAD()      { return cache.cad.data; }
  function getDONKI()    { return cache.donki.data; }
  function getISS()      { return cache.iss.data; }

  // Summary for info panel
  function getSummary() {
    const closest = cache.neos.data[0] || null;
    const hazardous = cache.neos.data.filter(n => n.isPotentiallyHazardous).length;
    const sentryCount = cache.sentry.data.length;
    const activeCMEs = (cache.donki.data.cmes || []).length;
    const activeFlares = (cache.donki.data.flares || []).length;
    const activeStorms = (cache.donki.data.storms || []).length;
    const iss = cache.iss.data;

    return {
      closestNEO: closest ? {
        name: closest.name,
        distanceLunar: closest.missDistanceLunar.toFixed(1),
        date: closest.closeApproachDate,
        hazardous: closest.isPotentiallyHazardous
      } : null,
      neoCount: cache.neos.data.length,
      hazardousCount: hazardous,
      sentryCount,
      solarWeather: {
        cmes: activeCMEs,
        flares: activeFlares,
        storms: activeStorms,
        kpMax: (cache.donki.data.storms || []).reduce((max, s) => Math.max(max, s.kpIndex || 0), 0)
      },
      issVisible: !!iss,
      issLat: iss?.lat,
      issLon: iss?.lon
    };
  }

  return {
    init,
    destroy,
    toggle,
    isEnabled,
    getPlanets,
    getNEOs,
    getSentry,
    getCAD,
    getDONKI,
    getISS,
    getSummary,
    refreshAll,
    // Exposed for testing
    _cache: cache,
    _fetchNEOs: fetchNEOs,
    _fetchSentry: fetchSentry,
    _fetchISS: fetchISS
  };
})();

if (typeof window !== 'undefined') window.CelestialTracker = CelestialTracker;
