import { createDatabase } from './src/server/database.js';
const db = createDatabase('./data/tunecamp.db');
try {
  console.log('Result of getRelease(4):', db.getRelease(4));
  console.log('Result of getTracksByReleaseId(4):', db.getTracksByReleaseId(4));
} catch(e) {
  console.error('SQL ERROR:', e.message);
}
