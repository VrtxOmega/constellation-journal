// ═══════════════════════════════════════════════════════════
// WSPR CLIENT — Weak Signal Propagation Reporter Data Feed
// Constellation Journal: Signal Layer
// ═══════════════════════════════════════════════════════════
// Fetches live WSPR spots from WSPRnet and converts to sky
// positions for arc rendering. Maidenhead grid → lat/lon → RA/Dec.
// Auto-refreshes every 5 minutes.
// ═══════════════════════════════════════════════════════════

const WSPRClient = (() => {
  'use strict';

  const REFRESH_INTERVAL = 300000; // 5 minutes
  const MAX_SPOTS = 100;
  const API_URL = 'https://www.wsprnet.org/drupal/wsprnet/spots/json';

  let spots = [];
  let refreshTimer = null;
  let onSpotsCallback = null;
  let lastFetch = 0;

  // ═══════════════════════════════════════════════════════════
  // MAIDENHEAD GRID → LAT/LON
  // ═══════════════════════════════════════════════════════════

  function maidenheadToLatLon(grid) {
    if (!grid || grid.length < 4) return null;
    const g = grid.toUpperCase();

    // Field (18x18 large squares)
    const lon = (g.charCodeAt(0) - 65) * 20 - 180;
    const lat = (g.charCodeAt(1) - 65) * 10 - 90;

    // Square (10x10 subdivisions)
    const lonSq = parseInt(g[2]) * 2;
    const latSq = parseInt(g[3]) * 1;

    let finalLon = lon + lonSq + 1; // center of square
    let finalLat = lat + latSq + 0.5;

    // Subsquare (24x24 further subdivisions) if 6-char grid
    if (grid.length >= 6) {
      const lonSub = (g.charCodeAt(4) - 65) * (2 / 24);
      const latSub = (g.charCodeAt(5) - 65) * (1 / 24);
      finalLon = lon + lonSq + lonSub + (1 / 24);
      finalLat = lat + latSq + latSub + (0.5 / 24);
    }

    return { lat: finalLat, lon: finalLon };
  }

  // ═══════════════════════════════════════════════════════════
  // LAT/LON → SKY POSITION (RA/Dec approximation)
  // ═══════════════════════════════════════════════════════════

  /**
   * Convert geographic coordinates to approximate RA/Dec.
   * Ground stations map to the celestial sphere using local sidereal time.
   * For visualization, we use a simplified mapping.
   */
  function latLonToSkyPos(lat, lon, date) {
    // Simplified: longitude → RA (with sidereal offset), latitude → Dec
    const d = date || new Date();
    const J2000 = new Date(2000, 0, 1, 12, 0, 0);
    const daysSince = (d - J2000) / 86400000;
    const gmst = (280.46061837 + 360.98564736629 * daysSince) % 360;

    // RA from longitude + Greenwich Mean Sidereal Time
    const ra = ((lon + gmst) % 360 + 360) % 360;
    const raHours = ra / 15.0; // Convert degrees to hours

    return { ra: raHours, dec: lat }; // Dec ≈ latitude for ground projection
  }

  // ═══════════════════════════════════════════════════════════
  // BAND COLOR MAPPING
  // ═══════════════════════════════════════════════════════════

  function bandColor(freqMHz) {
    if (freqMHz < 2)   return 0xFF4444; // 160m — red
    if (freqMHz < 5)   return 0xFF8844; // 80m — amber
    if (freqMHz < 8)   return 0x44CC66; // 40m — green
    if (freqMHz < 12)  return 0x44CCCC; // 30m — teal
    if (freqMHz < 16)  return 0x44EEFF; // 20m — cyan
    if (freqMHz < 25)  return 0x8888FF; // 15m — blue
    if (freqMHz < 35)  return 0xBB66FF; // 10m — violet
    return 0xCCCCCC; // higher bands — grey
  }

  function bandName(freqMHz) {
    if (freqMHz < 2)   return '160m';
    if (freqMHz < 5)   return '80m';
    if (freqMHz < 8)   return '40m';
    if (freqMHz < 12)  return '30m';
    if (freqMHz < 16)  return '20m';
    if (freqMHz < 25)  return '15m';
    if (freqMHz < 35)  return '10m';
    return `${Math.round(freqMHz)}MHz`;
  }

  // ═══════════════════════════════════════════════════════════
  // FETCH SPOTS
  // ═══════════════════════════════════════════════════════════

  async function fetchSpots() {
    try {
      let rawSpots = [];

      // Use IPC bridge (main process, no CORS) if available
      if (window.wspr && window.wspr.fetchSpots) {
        const result = await window.wspr.fetchSpots(10);
        if (result.error) {
          console.warn(`[WSPRClient] IPC fetch error: ${result.error}`);
        }
        rawSpots = result.spots || [];
      } else {
        // Direct fetch fallback (may fail due to CORS in Electron renderer)
        const resp = await fetch(API_URL + '?minutes=10', {
          signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) {
          console.warn(`[WSPRClient] Direct fetch returned ${resp.status}`);
          return [];
        }
        const data = await resp.json();
        rawSpots = Array.isArray(data) ? data : [];
      }

      if (rawSpots.length === 0) {
        console.log('[WSPRClient] No live spots available');
        return [];
      }

      spots = rawSpots.slice(0, MAX_SPOTS).map(spot => {
        const txPos = maidenheadToLatLon(spot.tgrid || spot.tx_grid);
        const rxPos = maidenheadToLatLon(spot.rgrid || spot.rx_grid);
        if (!txPos || !rxPos) return null;

        const freq = parseFloat(spot.freq || spot.frequency || 0);
        return {
          sender: spot.tcall || spot.tx_call || 'TX',
          receiver: spot.rcall || spot.rx_call || 'RX',
          freq,
          snr: parseInt(spot.snr || 0),
          txLat: txPos.lat, txLon: txPos.lon,
          rxLat: rxPos.lat, rxLon: rxPos.lon,
          color: bandColor(freq),
          band: bandName(freq),
          timestamp: Date.now()
        };
      }).filter(Boolean);

      console.log(`[WSPRClient] Fetched ${spots.length} live spots`);
      lastFetch = Date.now();
      if (onSpotsCallback) onSpotsCallback(spots);
      return spots;
    } catch (e) {
      console.warn('[WSPRClient] Fetch failed:', e);
      return [];
    }
  }


  // ═══════════════════════════════════════════════════════════
  // AUTO-REFRESH
  // ═══════════════════════════════════════════════════════════

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    fetchSpots();
    refreshTimer = setInterval(fetchSpots, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function onSpots(callback) {
    onSpotsCallback = callback;
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    maidenheadToLatLon,
    latLonToSkyPos,
    bandColor,
    bandName,
    fetchSpots,
    startAutoRefresh,
    stopAutoRefresh,
    onSpots,
    getSpots: () => spots,
    getLastFetch: () => lastFetch
  });
})();

if (typeof window !== 'undefined') window.WSPRClient = WSPRClient;
