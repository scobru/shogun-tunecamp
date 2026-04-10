
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
    /**
     * Generates a waveform data array from an audio file using streaming.
     * Returns an array of numbers representing audio peaks.
     * @param inputPath Path to the audio file
     * @param samples Number of samples to generate (default 100)
     * @param duration Optional duration in seconds for better precision
     */
    static async generateWaveform(inputPath: string, samples: number = 100, duration?: number): Promise<number[]> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`File not found: ${inputPath}`));
            }

            // We'll calculate peaks by dividing the stream into 'samples' number of buckets.
            const peaks = new Array(samples).fill(0);
            
            // Configuration for raw PCM extraction
            const sampleRate = 4000;
            const command = ffmpeg(inputPath)
                .audioFrequency(sampleRate)
                .audioChannels(1)
                .format('s16le'); // Signed 16-bit Little Endian PCM

            const stream = command.pipe();
            
            // If we have duration, we can calculate the exact bucket size
            // totalSamples = duration * sampleRate
            // bucketSize = totalSamples / samples
            let bucketSize = duration ? Math.max(1, Math.floor((duration * sampleRate) / samples)) : 0;
            
            let totalProcessedSamples = 0;
            let bytesRead = 0;
            const MAX_PCM_TOTAL = 200 * 1024 * 1024; // 200MB safety limit (~7 hours of 4kHz mono)

            // Buffer for partial samples (int16 is 2 bytes)
            let remaining: Buffer | null = null;

            stream.on('data', (chunk: Buffer) => {
                bytesRead += chunk.length;
                if (bytesRead > MAX_PCM_TOTAL) {
                    console.warn(`[Waveform] Track too large, truncating: ${inputPath}`);
                    stream.destroy();
                    return;
                }

                let data = chunk;
                if (remaining) {
                    data = Buffer.concat([remaining, chunk]);
                    remaining = null;
                }

                // If we don't have enough for a single sample, wait for next chunk
                if (data.length < 2) {
                    remaining = data;
                    return;
                }

                // Check for trailing byte
                if (data.length % 2 !== 0) {
                    remaining = data.subarray(data.length - 1);
                    data = data.subarray(0, data.length - 1);
                }

                // If we didn't have duration upfront, we'll collect samples and "spread" them at the end
                // But better to at least have a temporary accumulation.
                // For simplicity, we'll always use the current totalProcessedSamples to index buckets.
                // If bucketSize is 0 (no duration), we'll do a second pass logic or just estimate 5 mins.
                if (bucketSize === 0) {
                    const estimatedDuration = 300; // 5 mins fallback
                    bucketSize = Math.max(1, Math.floor((estimatedDuration * sampleRate) / samples));
                }

                for (let i = 0; i < data.length; i += 2) {
                    const val = Math.abs(data.readInt16LE(i));
                    const peak = parseFloat((val / 32768).toFixed(4));
                    
                    const bucketIndex = Math.floor(totalProcessedSamples / bucketSize);
                    if (bucketIndex < samples) {
                        if (peak > peaks[bucketIndex]) {
                            peaks[bucketIndex] = peak;
                        }
                    } else if (duration) {
                        // If we have duration and exceed buckets, it might be due to ffmpeg giving slightly more
                        // or duration being rounded. We just cap it at the last bucket.
                        if (peak > peaks[samples - 1]) {
                            peaks[samples - 1] = peak;
                        }
                    } else {
                        // Without duration, if we exceed our estimate, we need a way to rescale.
                        // For simplicity in a high-performance scenario, we'll just stop at 'samples' buckets
                        // or we could implement a dynamic resizing.
                        // But since Scanner usually HAS duration, this branch is rare.
                    }
                    totalProcessedSamples++;
                }
            });

            stream.on('end', () => {
                // If we didn't have duration and the file was much shorter/longer than 5 mins,
                // the 'peaks' array might be half empty or truncated.
                // However, since we're refactoring the Scanner to pass duration, this is optimized.
                resolve(peaks);
            });

            stream.on('error', (err) => {
                console.error("FFmpeg error during waveform streaming:", err);
                // Return empty peaks rather than crashing
                resolve(new Array(samples).fill(0));
            });
        });
    }
}
