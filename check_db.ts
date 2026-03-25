
import Database from 'better-sqlite3';

const db = new Database('tunecamp.db');
const users = db.prepare("SELECT id, username, gun_pub, is_active FROM admin").all();
console.log(JSON.stringify(users, null, 2));
db.close();
