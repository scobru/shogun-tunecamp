import fs from "fs-extra";
import path from "path";
import os from "os";

async function createDummyDir(baseDir: string, depth: number, breadth: number) {
    if (depth === 0) return;
    for (let i = 0; i < breadth; i++) {
        const dir = path.join(baseDir, `dir_${depth}_${i}`);
        await fs.mkdirp(dir);
        // create some files
        for (let j = 0; j < 50; j++) {
            await fs.writeFile(path.join(dir, `file_${j}.txt`), "hello world");
        }
        await createDummyDir(dir, depth - 1, breadth);
    }
}

async function runBenchmark() {
    const testDir = path.join(os.tmpdir(), "walkdir-test");
    await fs.remove(testDir);
    await fs.mkdirp(testDir);

    console.log("Creating dummy files...");
    await createDummyDir(testDir, 3, 4); // 4 + 16 + 64 dirs = 84 dirs. 84 * 50 = 4200 files.

    // Original implementation
    const filesSeq: any[] = [];
    async function walkDirSeq(dir: string, prefix = "") {
        if (!(await fs.pathExists(dir))) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDirSeq(fullPath, `${prefix}${entry.name}/`);
            } else {
                const stat = await fs.stat(fullPath);
                filesSeq.push({
                    name: `${prefix}${entry.name}`,
                    type: path.extname(entry.name).substring(1),
                    size: stat.size,
                });
            }
        }
    }

    // Optimized implementation
    const filesPar: any[] = [];
    async function walkDirPar(dir: string, prefix = "") {
        if (!(await fs.pathExists(dir))) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDirPar(fullPath, `${prefix}${entry.name}/`);
            } else {
                const stat = await fs.stat(fullPath);
                filesPar.push({
                    name: `${prefix}${entry.name}`,
                    type: path.extname(entry.name).substring(1),
                    size: stat.size,
                });
            }
        }));
    }

    console.log("Benchmarking Sequential...");
    const startSeq = performance.now();
    await walkDirSeq(testDir);
    const endSeq = performance.now();
    console.log(`Sequential: ${endSeq - startSeq} ms, found ${filesSeq.length} files`);

    console.log("Benchmarking Parallel...");
    const startPar = performance.now();
    await walkDirPar(testDir);
    const endPar = performance.now();
    console.log(`Parallel: ${endPar - startPar} ms, found ${filesPar.length} files`);

    await fs.remove(testDir);
}

runBenchmark().catch(console.error);
