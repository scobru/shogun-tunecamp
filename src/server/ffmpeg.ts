import path from "path";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath && ffprobePath.path) {
    ffmpeg.setFfprobePath(ffprobePath.path);
}

/**
 * Get duration of an audio file using ffprobe
 * Returns the path to the new MP3 file
 */
export function getDurationFromFfmpeg(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`    [FFmpeg] ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
                resolve(null);
            } else {
                const duration = metadata.format.duration;
                resolve(duration ? parseFloat(duration as any) : null);
            }
        });
    });
}

/**
 * Convert a Lossless file (WAV/FLAC) to MP3 using ffmpeg
 * Returns the path to the new MP3 file
 */
export function convertWavToMp3(inputPath: string, bitrate: string = '320k'): Promise<string> {
    return new Promise((resolve, reject) => {
        // Safe extension replacement
        const parse = path.parse(inputPath);
        const mp3Path = path.join(parse.dir, `${parse.name}.mp3`);

        if (mp3Path === inputPath) {
             return reject(new Error("Output path same as input path (not a supported lossless extension?)"));
        }

        const startTime = Date.now();
        const startSize = fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0;
        console.log(`    [FFmpeg] Converting to MP3: ${path.basename(inputPath)} (${(startSize / 1024 / 1024).toFixed(2)} MB)`);

        ffmpeg(inputPath)
            .audioBitrate(bitrate)
            .audioCodec('libmp3lame')
            .format('mp3')
            .outputOptions('-map_metadata', '0', '-id3v2_version', '3')
            .on('end', () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`    [FFmpeg] Converted to: ${path.basename(mp3Path)} in ${duration}s`);
                resolve(mp3Path);
            })
            .on('error', (err) => {
                console.error(`    [FFmpeg] Conversion failed: ${err.message}`);
                reject(err);
            })
            .save(mp3Path);
    });
}

/**
 * Update metadata for audio files (FLAC, OGG, M4A, etc.) using ffmpeg
 * Copies audio stream without re-encoding
 */
export function writeMetadata(filePath: string, metadata: { title?: string, artist?: string, album?: string, track?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
        const ext = path.extname(filePath);
        // Create a temp file path next to original
        const tempPath = path.join(path.dirname(filePath), `${path.basename(filePath, ext)}.temp${ext}`);

        const command = ffmpeg(filePath)
            .outputOptions('-c', 'copy') // Copy streams (no re-encode)
            .outputOptions('-map_metadata', '0'); // Copy existing metadata

        // Set new metadata
        if (metadata.title) command.outputOptions('-metadata', `title=${metadata.title}`);
        if (metadata.artist) command.outputOptions('-metadata', `artist=${metadata.artist}`);
        if (metadata.album) command.outputOptions('-metadata', `album=${metadata.album}`);
        if (metadata.track) command.outputOptions('-metadata', `track=${metadata.track}`);

        command
            .save(tempPath)
            .on('end', async () => {
                try {
                    await fs.move(tempPath, filePath, { overwrite: true });
                    resolve();
                } catch (e) {
                    await fs.remove(tempPath).catch(() => {});
                    reject(e);
                }
            })
            .on('error', (err) => {
                fs.remove(tempPath).catch(() => {});
                console.error(`    [FFmpeg] Metadata update failed for ${path.basename(filePath)}: ${err.message}`);
                reject(err);
            });
    });
}
