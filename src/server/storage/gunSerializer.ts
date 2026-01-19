/**
 * GunDB Serializer/Deserializer
 * GunDB does not support arrays natively - they must be converted to objects
 * GunDB also rejects undefined values - they must be removed
 */

import { ReleaseConfig, ArtistConfig, TrackMetadata } from '../../types/index.js';

/**
 * Convert array to object with numeric keys
 */
function arrayToObject<T>(arr: T[] | undefined): Record<string, T> | null {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;

    const obj: Record<string, T> = {};
    arr.forEach((item, index) => {
        obj[index.toString()] = item;
    });
    return obj;
}

/**
 * Convert object with numeric keys back to array
 */
function objectToArray<T>(obj: Record<string, T> | undefined | null): T[] | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    const arr: T[] = [];
    const keys = Object.keys(obj).sort((a, b) => parseInt(a) - parseInt(b));

    keys.forEach(key => {
        if (!isNaN(parseInt(key))) {
            arr.push(obj[key]);
        }
    });

    return arr.length > 0 ? arr : undefined;
}

/**
 * Remove undefined values from an object (GunDB rejects undefined)
 */
function removeUndefined(obj: any): any {
    if (obj === null) return null;
    if (obj === undefined) return null;
    if (typeof obj !== 'object') return obj;

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                const cleaned = removeUndefined(value);
                if (cleaned !== null && Object.keys(cleaned).length > 0) {
                    result[key] = cleaned;
                }
            } else {
                result[key] = value;
            }
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

/**
 * Serialize ReleaseConfig for GunDB storage
 */
export function serializeReleaseConfig(config: ReleaseConfig): any {
    const result: any = {};

    // Copy non-array fields, skipping undefined
    for (const [key, value] of Object.entries(config)) {
        if (value === undefined || value === null) continue;
        if (key === 'genres' || key === 'streamingLinks' || key === 'credits') continue;
        result[key] = value;
    }

    // Convert arrays to objects (only if they have values)
    const genres = arrayToObject(config.genres);
    if (genres) result.genres = genres;

    const streamingLinks = arrayToObject(config.streamingLinks);
    if (streamingLinks) result.streamingLinks = streamingLinks;

    const credits = arrayToObject(config.credits);
    if (credits) result.credits = credits;

    return result;
}

/**
 * Deserialize ReleaseConfig from GunDB
 */
export function deserializeReleaseConfig(data: any): ReleaseConfig {
    if (!data) return data;

    return {
        ...data,
        genres: objectToArray(data.genres),
        streamingLinks: objectToArray(data.streamingLinks),
        credits: objectToArray(data.credits),
    };
}

/**
 * Serialize ArtistConfig for GunDB storage
 */
export function serializeArtistConfig(config: ArtistConfig): any {
    const result: any = {};

    // Copy non-array fields, skipping undefined
    for (const [key, value] of Object.entries(config)) {
        if (value === undefined || value === null) continue;
        if (key === 'links' || key === 'donationLinks') continue;
        result[key] = value;
    }

    // Convert arrays to objects (only if they have values)
    const links = arrayToObject(config.links);
    if (links) result.links = links;

    const donationLinks = arrayToObject(config.donationLinks);
    if (donationLinks) result.donationLinks = donationLinks;

    return result;
}

/**
 * Deserialize ArtistConfig from GunDB
 */
export function deserializeArtistConfig(data: any): ArtistConfig {
    if (!data) return data;

    return {
        ...data,
        links: objectToArray(data.links),
        donationLinks: objectToArray(data.donationLinks),
    };
}

/**
 * Serialize TrackMetadata for GunDB storage
 */
export function serializeTrackMetadata(track: TrackMetadata): any {
    const result: any = {};

    // Copy non-array fields, skipping undefined
    for (const [key, value] of Object.entries(track)) {
        if (value === undefined || value === null) continue;
        if (key === 'genre') continue;
        result[key] = value;
    }

    // Convert arrays to objects (only if they have values)
    const genre = arrayToObject(track.genre);
    if (genre) result.genre = genre;

    return result;
}

/**
 * Deserialize TrackMetadata from GunDB
 */
export function deserializeTrackMetadata(data: any): TrackMetadata {
    if (!data) return data;

    return {
        ...data,
        genre: objectToArray(data.genre),
    };
}
