const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function cosineSimilarity(A, B) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < A.length; i++) {
    dot += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'constellation-journal', 'constellation-journal.db');
  const db = new Database(dbPath);

  const entries = db.prepare('SELECT day_of_year, embedding FROM entries WHERE day_of_year IN (10, 50)').all();
  
  if (entries.length === 2) {
    const e1 = JSON.parse(entries[0].embedding);
    const e2 = JSON.parse(entries[1].embedding);
    const sim = cosineSimilarity(e1, e2);
    console.log(`Cosine Similarity between ${entries[0].day_of_year} and ${entries[1].day_of_year}: ${sim}`);
  } else {
    console.log("Not enough entries for comparison.");
  }
}

test().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
