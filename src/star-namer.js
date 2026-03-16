// Constellation Journal — Star Namer
// VERITAS Ω: Deterministic name generation from emotion vector.
// Domain: emotion → astronomical name. No randomness — same input, same output.

// Greek letters for star designation (Bayer convention)
const GREEK = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
  'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];

// Constellation genitives (Latin) — sorted by emotional mapping
const BLUE_GIANT_CONSTELLATIONS = [   // sad, melancholy
  'Aquarii', 'Piscium', 'Ceti', 'Eridani', 'Lacertae',
  'Cygni', 'Lyrae', 'Pavonis', 'Gruis', 'Tucanae'
];

const YELLOW_DWARF_CONSTELLATIONS = [ // happy, content
  'Leonis', 'Sagittarii', 'Aurigae', 'Geminorum', 'Virginis',
  'Librae', 'Capricorni', 'Aquilae', 'Delphini', 'Columbae'
];

const RED_SUPERGIANT_CONSTELLATIONS = [ // intense, furious, ecstatic
  'Orionis', 'Scorpii', 'Tauri', 'Arietis', 'Draconis',
  'Herculis', 'Ophiuchi', 'Serpentis', 'Centauri', 'Luporum'
];

const NEUTRAL_CONSTELLATIONS = [      // contemplative, still
  'Ursae Majoris', 'Ursae Minoris', 'Cassiopeiae', 'Andromedae',
  'Persei', 'Canum Venaticorum', 'Coronae Borealis', 'Bootis',
  'Comae Berenices', 'Monocerotis'
];

/**
 * Map emotion to stellar temperature (Kelvin).
 * Astronomically accurate color-temperature relationship:
 *   Blue giants:      10,000–30,000K (sad, low valence)
 *   Yellow dwarfs:     4,500–6,000K  (happy, positive valence)
 *   Red supergiants:   3,000–3,800K  (intense, high arousal)
 *   White/neutral:     6,000–9,000K  (contemplative, near-zero)
 */
function emotionToTemperature(emotion) {
  const { valence, arousal } = emotion;

  if (arousal > 0.5) {
    // High arousal → red supergiant territory (hot emotion, cool star = paradox resolved by size)
    return 3000 + (1 - arousal) * 800; // 3000–3800K
  }
  if (valence < -0.2) {
    // Negative valence → blue giants (cold emotion = hot star = blue)
    return 10000 + Math.abs(valence) * 20000; // 10,000–30,000K
  }
  if (valence > 0.2) {
    // Positive valence → yellow dwarfs (warm emotion = warm star)
    return 4500 + valence * 1500; // 4,500–6,000K
  }
  // Neutral → white
  return 6000 + arousal * 3000; // 6,000–9,000K
}

/**
 * Convert temperature (K) to hex color.
 * Uses Planck blackbody approximation (Tanner Helland algorithm).
 */
function temperatureToHex(tempK) {
  const temp = tempK / 100;
  let r, g, b;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a star name deterministically from emotion.
 * Same emotion input → same name output.
 */
function generate(emotion) {
  const { valence, arousal, label } = emotion;

  // Select constellation pool based on emotion category
  let pool;
  if (arousal > 0.5) {
    pool = RED_SUPERGIANT_CONSTELLATIONS;
  } else if (valence < -0.2) {
    pool = BLUE_GIANT_CONSTELLATIONS;
  } else if (valence > 0.2) {
    pool = YELLOW_DWARF_CONSTELLATIONS;
  } else {
    pool = NEUTRAL_CONSTELLATIONS;
  }

  // Deterministic index from valence + arousal (no Math.random)
  const hash = Math.abs(Math.round((valence * 1000 + arousal * 777) * 13.37)) % pool.length;
  const greekIdx = Math.abs(Math.round((arousal * 500 + valence * 333) * 7.13)) % GREEK.length;

  return `${GREEK[greekIdx]} ${pool[hash]}`;
}

module.exports = { generate, emotionToTemperature, temperatureToHex };
