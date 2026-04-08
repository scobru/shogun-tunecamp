import fs from 'fs-extra';
import path from 'path';
import { TorrentService } from './dist/server/torrent.js';

async function test() {
  console.log("🧪 Testing TorrentService RO Error Handling...");
  
  const dummyDb = {
    getTorrents: () => [],
    createTorrent: () => {},
    deleteTorrent: () => {},
    getSetting: () => ""
  };
  
  const dummyScanner = {
    processAudioFile: async () => {}
  };

  const roDir = path.resolve('./test-ro-dir');
  if (!fs.existsSync(roDir)) fs.mkdirSync(roDir);
  
  // Set to RO
  fs.chmodSync(roDir, 0o444);
  
  try {
    console.log(`Testing with RO dir (no downloadDir override): ${roDir}`);
    const service = new TorrentService(dummyDb, dummyScanner, roDir, undefined, 6881);
    console.log("✅ Success: Service handled RO error gracefully and stayed alive.");
    service.destroy();
  } catch (err) {
    console.error("❌ Failed: TorrentService crashed!", err);
    process.exit(1);
  } finally {
    // Cleanup
    fs.chmodSync(roDir, 0o755);
    fs.removeSync(roDir);
  }
}

test();
