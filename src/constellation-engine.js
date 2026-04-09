// Constellation Journal — Constellation Engine
// VERITAS Ω: K-means clustering on emotion vectors with MST line connections.
// Domain: entries[] → constellations[]. Deterministic given same input order.

/**
 * Detect constellations from journal entries.
 * @param {Array} entries — all entries for a year (from store)
 * @returns {Array} constellations with names, themes, star days, and line pairs
 */
function detect(entries) {
  if (!entries || entries.length < 3) return [];

  // Extract emotion vectors [valence, arousal] for clustering
  const points = entries.map(e => ({
    day: e.day_of_year,
    valence: e.emotion_valence,
    arousal: e.emotion_arousal,
    label: e.emotion_label
  }));

  // Determine k: ceil(n/15), minimum 1, maximum 12
  const k = Math.max(1, Math.min(12, Math.ceil(points.length / 15)));

  // K-means clustering
  const clusters = kmeans(points, k, 50);

  // Filter clusters with fewer than 3 members
  const validClusters = clusters.filter(c => c.members.length >= 3);

  // Build constellations
  return validClusters.map(cluster => {
    const theme = extractTheme(cluster.members);
    const name = generateConstellationName(theme);
    const linePairs = computeMST(cluster.members, entries);
    const starDays = cluster.members.map(m => m.day);

    return { name, theme, starDays, linePairs };
  });
}

/**
 * K-means clustering on 2D emotion space [valence, arousal].
 * Deterministic initialization: evenly spaced through sorted data.
 */
function kmeans(points, k, maxIter) {
  // Deterministic centroid initialization: pick evenly spaced points
  const sorted = [...points].sort((a, b) => a.valence - b.valence || a.arousal - b.arousal);
  const step = Math.max(1, Math.floor(sorted.length / k));
  let centroids = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, sorted.length - 1);
    centroids.push({ valence: sorted[idx].valence, arousal: sorted[idx].arousal });
  }

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let bestC = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dv = points[i].valence - centroids[c].valence;
        const da = points[i].arousal - centroids[c].arousal;
        const dist = dv * dv + da * da;
        if (dist < minDist) {
          minDist = dist;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    if (!changed) break;

    // Recompute centroids
    const sums = centroids.map(() => ({ v: 0, a: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c].v += points[i].valence;
      sums[c].a += points[i].arousal;
      sums[c].n++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n > 0) {
        centroids[c].valence = sums[c].v / sums[c].n;
        centroids[c].arousal = sums[c].a / sums[c].n;
      }
    }
  }

  // Group members
  const clusters = centroids.map((c, i) => ({
    centroid: c,
    members: []
  }));
  for (let i = 0; i < points.length; i++) {
    clusters[assignments[i]].members.push(points[i]);
  }

  return clusters;
}

/**
 * Extract the dominant emotion theme from cluster members.
 */
function extractTheme(members) {
  const counts = {};
  for (const m of members) {
    counts[m.label] = (counts[m.label] || 0) + 1;
  }
  let maxLabel = 'contemplative';
  let maxCount = 0;
  for (const [label, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLabel = label;
    }
  }
  return maxLabel;
}

/**
 * Generate a constellation name from its emotional theme.
 */
const CONSTELLATION_SUFFIXES = [
  'Arc', 'Nebula', 'Cluster', 'Crown', 'Bridge', 'Veil',
  'Stream', 'Ring', 'Spire', 'Chain', 'Drift', 'Path'
];

function generateConstellationName(theme) {
  // Capitalize theme
  const themeName = theme.charAt(0).toUpperCase() + theme.slice(1);
  // Deterministic suffix from theme hash
  let hash = 0;
  for (let i = 0; i < theme.length; i++) {
    hash = ((hash << 5) - hash + theme.charCodeAt(i)) | 0;
  }
  const suffix = CONSTELLATION_SUFFIXES[Math.abs(hash) % CONSTELLATION_SUFFIXES.length];
  return `The ${themeName} ${suffix}`;
}

/**
 * Compute Minimum Spanning Tree line pairs within a cluster.
 * Uses Prim's algorithm on angular distance between stars.
 * Returns array of [dayA, dayB] pairs.
 */
function computeMST(members, allEntries) {
  if (members.length < 2) return [];

  const n = members.length;
  const inMST = new Array(n).fill(false);
  const minEdge = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  minEdge[0] = 0;

  const pairs = [];

  for (let count = 0; count < n; count++) {
    // Find minimum edge not in MST
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!inMST[i] && (u === -1 || minEdge[i] < minEdge[u])) {
        u = i;
      }
    }

    inMST[u] = true;
    if (parent[u] !== -1) {
      pairs.push([members[parent[u]].day, members[u].day]);
    }

    // Update edges
    for (let v = 0; v < n; v++) {
      if (!inMST[v]) {
        const dv = members[u].valence - members[v].valence;
        const da = members[u].arousal - members[v].arousal;
        const dist = Math.sqrt(dv * dv + da * da);
        if (dist < minEdge[v]) {
          minEdge[v] = dist;
          parent[v] = u;
        }
      }
    }
  }

  return pairs;
}

module.exports = { detect };
