import { loadConfig } from "./dist/server/config.js";
import path from "path";

const config = loadConfig();
console.log("Database path:", config.dbPath);
console.log("Current working directory:", process.cwd());
