// Constellation Journal — Constellation Engine
// VERITAS Ω: K-means clustering on emotion vectors with MST line connections.
// Domain: entries[] → constellations[]. Deterministic given same input order.

/**
 * Distance metric combining Semantic Embeddings (Cosine) with fallback to AFINN Space (Euclidean)
 */
function getDistance(a, b) {
  if (a.embedding && b.embedding) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.embedding.length; i++) {
      dot += a.embedding[i] * b.embedding[i];
      normA += a.embedding[i] * a.embedding[i];
      normB += b.embedding[i] * b.embedding[i];
    }
    if (normA === 0 || normB === 0) return 1;
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Cosine distance [0, 2]
  }
  // Fallback to AFINN 2D distance
  const dv = a.valence - b.valence;
  const da = a.arousal - b.arousal;
  return dv * dv + da * da;
}

/**
 * Detect constellations from journal entries.
 * @param {Array} entries — all entries for a year (from store)
 * @returns {Array} constellations with names, themes, star days, and line pairs
 */
function detect(entries) {
  if (!entries || entries.length < 3) return [];

  // Extract emotion vectors [valence, arousal, embedding] for clustering
  const points = entries.map(e => ({
    day: e.day_of_year,
    valence: e.emotion_valence,
    arousal: e.emotion_arousal,
    label: e.emotion_label,
    embedding: e.embedding || null
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
    const linePairs = computeMST(cluster.members);
    const starDays = cluster.members.map(m => m.day);

    return { name, theme, starDays, linePairs };
  });
}

/**
 * K-means clustering strictly utilizing embeddings geometry + 2D fallback.
 * Deterministic initialization: evenly spaced through sorted data.
 */
function kmeans(points, k, maxIter) {
  const sorted = [...points].sort((a, b) => a.valence - b.valence || a.arousal - b.arousal);
  const step = Math.max(1, Math.floor(sorted.length / k));
  let centroids = [];
  
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, sorted.length - 1);
    centroids.push({ 
      valence: sorted[idx].valence, 
      arousal: sorted[idx].arousal,
      embedding: sorted[idx].embedding ? [...sorted[idx].embedding] : null
    });
  }

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let bestC = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = getDistance(points[i], centroids[c]);
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
    const sums = centroids.map(() => ({ v: 0, a: 0, n: 0, e: null }));
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c].v += points[i].valence;
      sums[c].a += points[i].arousal;
      sums[c].n++;
      
      if (points[i].embedding) {
        if (!sums[c].e) sums[c].e = new Array(points[i].embedding.length).fill(0);
        for (let d = 0; d < points[i].embedding.length; d++) {
          sums[c].e[d] += points[i].embedding[d];
        }
      }
    }
    
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n > 0) {
        centroids[c].valence = sums[c].v / sums[c].n;
        centroids[c].arousal = sums[c].a / sums[c].n;
        if (sums[c].e) {
          if (!centroids[c].embedding) centroids[c].embedding = new Array(sums[c].e.length).fill(0);
          for (let d = 0; d < sums[c].e.length; d++) {
             centroids[c].embedding[d] = sums[c].e[d] / sums[c].n;
          }
        }
      }
    }
  }

  const clusters = centroids.map(c => ({ centroid: c, members: [] }));
  for (let i = 0; i < points.length; i++) {
    clusters[assignments[i]].members.push(points[i]);
  }

  return clusters;
}

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

const CONSTELLATION_SUFFIXES = [
  'Arc', 'Nebula', 'Cluster', 'Crown', 'Bridge', 'Veil',
  'Stream', 'Ring', 'Spire', 'Chain', 'Drift', 'Path'
];

function generateConstellationName(theme) {
  const themeName = theme.charAt(0).toUpperCase() + theme.slice(1);
  let hash = 0;
  for (let i = 0; i < theme.length; i++) {
    hash = ((hash << 5) - hash + theme.charCodeAt(i)) | 0;
  }
  const suffix = CONSTELLATION_SUFFIXES[Math.abs(hash) % CONSTELLATION_SUFFIXES.length];
  return `The ${themeName} ${suffix}`;
}

function computeMST(members) {
  if (members.length < 2) return [];

  const n = members.length;
  const inMST = new Array(n).fill(false);
  const minEdge = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  minEdge[0] = 0;

  const pairs = [];

  for (let count = 0; count < n; count++) {
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

    for (let v = 0; v < n; v++) {
      if (!inMST[v]) {
        const dv = members[u].valence - members[v].valence;
        const da = members[u].arousal - members[v].arousal;
        const dist = dv * dv + da * da; // Squared distance sufficient for ordering
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
