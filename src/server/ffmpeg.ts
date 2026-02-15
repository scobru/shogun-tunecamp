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
 * Convert a WAV file to MP3 using ffmpeg
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
