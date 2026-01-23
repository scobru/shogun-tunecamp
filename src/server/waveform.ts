
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs-extra";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

export class WaveformService {
    /**
     * Generates a waveform data array from an audio file.
     * Returns an array of numbers representing audio peaks.
     * @param inputPath Path to the audio file
     * @param samples Number of samples to generate (default 100)
     */
    static async generateWaveform(inputPath: string, samples: number = 100): Promise<number[]> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`File not found: ${inputPath}`));
            }

            const data: number[] = [];

            // This is a simplified waveform generation strategy using the 'showwavespic' filter might be too heavy or exact.
            // Instead, we'll use 'volumedetect' or a custom filter chain to read raw audio data.
            // HOWEVER, reading raw PCM data and calculating peaks is the most robust way.

            // Strategy: Convert audio to raw PCM, read stream, calculate RMS/Peaks.
            // For a "visual" waveform (like SoundCloud), we want peaks over time.

            // Let's use a faster, simpler approximation:
            // We can ask ffmpeg to output a custom textual representation or just downmix to a low sample rate 
            // and read every Nth sample.

            // Better approach for speed: use 'loudnorm' or similar to get stats? No, that gives overall stats.

            // Let's try reading raw PCM data.
            // Downsample to something manageable like 4000Hz (low quality but enough for peaks)
            // Mono channel.

            const command = ffmpeg(inputPath)
                .audioFrequency(4000)
                .audioChannels(1)
                .format('s16le'); // Signed 16-bit Little Endian PCM

            const stream = command.pipe();
            const bufferChunks: Buffer[] = [];

            stream.on('data', (chunk: Buffer) => {
                bufferChunks.push(chunk);
            });

            stream.on('end', () => {
                const buffer = Buffer.concat(bufferChunks);
                // buffer contains raw 16-bit integer samples
                // Each sample is 2 bytes
                const totalSamples = Math.floor(buffer.length / 2);

                if (totalSamples === 0) {
                    return resolve(new Array(samples).fill(0));
                }

                const step = Math.floor(totalSamples / samples);
                const peaks: number[] = [];

                for (let i = 0; i < samples; i++) {
                    let start = i * step * 2; // byte offset
                    let max = 0;

                    // Check a simplified window for the peak (don't scan every single sample for speed, maybe scan 100 samples in the window)
                    // Or scan the whole window if step is small.
                    // Let's scan a representative chunk of the window to keep it fast.
                    const windowSize = Math.min(step, 1000); // scan at most 1000 samples per block

                    for (let j = 0; j < windowSize; j++) {
                        const offset = start + (j * 2);
                        if (offset + 1 >= buffer.length) break;

                        // Read Int16
                        const val = Math.abs(buffer.readInt16LE(offset));
                        if (val > max) max = val;
                    }

                    // Normalize to 0-1 range (16-bit max is 32768)
                    // Using non-linear scaling can look better for visualizations
                    const normalized = parseFloat((max / 32768).toFixed(4));
                    peaks.push(normalized);
                }

                resolve(peaks);
            });

            stream.on('error', (err) => {
                console.error("FFmpeg error:", err);
                reject(err);
            });
        });
    }
}
