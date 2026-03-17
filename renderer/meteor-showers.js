// ═══════════════════════════════════════════════════════════
// METEOR SHOWERS — Static Data Catalog
// Constellation Journal: Phase 4A
// ═══════════════════════════════════════════════════════════
// 12 major meteor showers with radiant points, active windows,
// peak dates, and zenithal hourly rates (ZHR).
// Data sourced from IMO (International Meteor Organization).
// ═══════════════════════════════════════════════════════════

const MeteorShowers = (() => {
  'use strict';

  // All dates stored as { month (1-12), day (1-31) }
  // RA in hours (0-24), Dec in degrees (-90 to +90)

  const SHOWERS = Object.freeze([
    {
      id: 'QUA', name: 'Quadrantids',
      radiant: { ra: 15.33, dec: 49.0 },
      active: { start: { month: 1, day: 1 }, end: { month: 1, day: 6 } },
      peak: { month: 1, day: 3 },
      zhr: 120,
      speed: 41, // km/s
      parent: '2003 EH1',
      color: 0x88BBFF // blue-white
    },
    {
      id: 'LYR', name: 'Lyrids',
      radiant: { ra: 18.07, dec: 34.0 },
      active: { start: { month: 4, day: 16 }, end: { month: 4, day: 25 } },
      peak: { month: 4, day: 22 },
      zhr: 18,
      speed: 49,
      parent: 'C/1861 G1 (Thatcher)',
      color: 0xFFEECC // warm white
    },
    {
      id: 'ETA', name: 'Eta Aquariids',
      radiant: { ra: 22.33, dec: -1.0 },
      active: { start: { month: 4, day: 19 }, end: { month: 5, day: 28 } },
      peak: { month: 5, day: 6 },
      zhr: 50,
      speed: 66,
      parent: '1P/Halley',
      color: 0xFFDD88 // gold
    },
    {
      id: 'SDA', name: 'Southern Delta Aquariids',
      radiant: { ra: 22.67, dec: -16.0 },
      active: { start: { month: 7, day: 12 }, end: { month: 8, day: 23 } },
      peak: { month: 7, day: 30 },
      zhr: 25,
      speed: 41,
      parent: '96P/Machholz',
      color: 0xCCBBFF // lavender
    },
    {
      id: 'PER', name: 'Perseids',
      radiant: { ra: 3.07, dec: 58.0 },
      active: { start: { month: 7, day: 17 }, end: { month: 8, day: 24 } },
      peak: { month: 8, day: 12 },
      zhr: 100,
      speed: 59,
      parent: '109P/Swift-Tuttle',
      color: 0xFFFFCC // bright yellow-white
    },
    {
      id: 'DRA', name: 'Draconids',
      radiant: { ra: 17.47, dec: 54.0 },
      active: { start: { month: 10, day: 6 }, end: { month: 10, day: 10 } },
      peak: { month: 10, day: 8 },
      zhr: 10,
      speed: 20,
      parent: '21P/Giacobini-Zinner',
      color: 0xFFCC88 // amber
    },
    {
      id: 'ORI', name: 'Orionids',
      radiant: { ra: 6.33, dec: 16.0 },
      active: { start: { month: 10, day: 2 }, end: { month: 11, day: 7 } },
      peak: { month: 10, day: 21 },
      zhr: 20,
      speed: 66,
      parent: '1P/Halley',
      color: 0xFFDD88 // gold
    },
    {
      id: 'TAU', name: 'Taurids',
      radiant: { ra: 3.73, dec: 14.0 },
      active: { start: { month: 10, day: 1 }, end: { month: 12, day: 10 } },
      peak: { month: 11, day: 5 },
      zhr: 5,
      speed: 27,
      parent: '2P/Encke',
      color: 0xFF9944 // deep amber
    },
    {
      id: 'LEO', name: 'Leonids',
      radiant: { ra: 10.13, dec: 22.0 },
      active: { start: { month: 11, day: 6 }, end: { month: 11, day: 30 } },
      peak: { month: 11, day: 17 },
      zhr: 15,
      speed: 71,
      parent: '55P/Tempel-Tuttle',
      color: 0xCCFFCC // green-white
    },
    {
      id: 'GEM', name: 'Geminids',
      radiant: { ra: 7.47, dec: 33.0 },
      active: { start: { month: 12, day: 4 }, end: { month: 12, day: 20 } },
      peak: { month: 12, day: 14 },
      zhr: 150,
      speed: 35,
      parent: '3200 Phaethon',
      color: 0xFFFFFF // bright white
    },
    {
      id: 'URS', name: 'Ursids',
      radiant: { ra: 14.47, dec: 76.0 },
      active: { start: { month: 12, day: 17 }, end: { month: 12, day: 26 } },
      peak: { month: 12, day: 22 },
      zhr: 10,
      speed: 33,
      parent: '8P/Tuttle',
      color: 0xBBDDFF // ice blue
    },
    {
      id: 'COM', name: 'Sigma Hydrids',
      radiant: { ra: 8.67, dec: 2.0 },
      active: { start: { month: 12, day: 3 }, end: { month: 12, day: 20 } },
      peak: { month: 12, day: 12 },
      zhr: 3,
      speed: 58,
      parent: 'Unknown',
      color: 0xDDCCFF // pale violet
    }
  ]);

  // ═══════════════════════════════════════════════════════════
  // ACTIVITY COMPUTATION
  // ═══════════════════════════════════════════════════════════

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / 86400000);
  }

  function dateToDOY(md) {
    // Convert { month, day } to approximate day-of-year
    const daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    return daysInMonth[md.month - 1] + md.day;
  }

  /**
   * Get all active showers for a given date.
   * Returns array of { shower, activity } where activity is 0-1 (1 = peak).
   */
  function getActiveShowers(date) {
    const doy = (date instanceof Date) ? dayOfYear(date) : date;
    const results = [];

    for (const shower of SHOWERS) {
      let startDOY = dateToDOY(shower.active.start);
      let endDOY = dateToDOY(shower.active.end);
      let peakDOY = dateToDOY(shower.peak);

      // Handle year wrap (e.g., Dec 28 → Jan 6)
      if (endDOY < startDOY) {
        if (doy >= startDOY || doy <= endDOY) {
          const activity = computeActivity(doy, startDOY, endDOY, peakDOY);
          results.push({ shower, activity });
        }
      } else {
        if (doy >= startDOY && doy <= endDOY) {
          const activity = computeActivity(doy, startDOY, endDOY, peakDOY);
          results.push({ shower, activity });
        }
      }
    }

    return results;
  }

  function computeActivity(doy, startDOY, endDOY, peakDOY) {
    // Cosine falloff from peak
    let totalSpan, distFromPeak;

    if (endDOY < startDOY) {
      // Year wrap
      totalSpan = (365 - startDOY) + endDOY;
      if (doy >= startDOY) {
        distFromPeak = Math.abs(doy - peakDOY);
      } else {
        distFromPeak = Math.abs(doy + 365 - peakDOY);
      }
    } else {
      totalSpan = endDOY - startDOY;
      distFromPeak = Math.abs(doy - peakDOY);
    }

    const halfSpan = totalSpan / 2;
    if (halfSpan === 0) return 1.0;
    const normalized = Math.min(1, distFromPeak / halfSpan);
    return Math.cos(normalized * Math.PI / 2); // cosine falloff
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    SHOWERS,
    getActiveShowers,
    dateToDOY,
    dayOfYear
  });
})();

if (typeof window !== 'undefined') window.MeteorShowers = MeteorShowers;
