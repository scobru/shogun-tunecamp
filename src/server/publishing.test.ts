
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createPublishingService } from './publishing.js';
import { createDatabase } from './database.js';
import type { GunDBService } from './gundb.js';
import type { ActivityPubService } from './activitypub.js';
import type { ServerConfig } from './config.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = ':memory:';

describe('PublishingService - Visibility Toggle', () => {
    let db: ReturnType<typeof createDatabase>;
    let gundbMock: GunDBService;
    let apMock: ActivityPubService;
    let configMock: ServerConfig;
    let publishingService: ReturnType<typeof createPublishingService>;

    beforeEach(() => {
        // Setup DB
        db = createDatabase(TEST_DB_PATH);

        // Setup Mock GunDB
        gundbMock = {
            init: jest.fn(),
            registerSite: jest.fn(),
            registerTracks: jest.fn(),
            unregisterTracks: jest.fn(),
            getDownloadCount: jest.fn(),
            incrementDownloadCount: jest.fn(),
            getTrackDownloadCount: jest.fn(),
            incrementTrackDownloadCount: jest.fn(),
            getCommunitySites: jest.fn(),
            getCommunityTracks: jest.fn(),
            registerUser: jest.fn(),
            getUser: jest.fn(),
            getUserByUsername: jest.fn(),
            addComment: jest.fn(),
            getComments: jest.fn(),
            deleteComment: jest.fn(),
            getIdentityKeyPair: jest.fn(),
            setIdentityKeyPair: jest.fn(),
            syncNetwork: jest.fn().mockReturnValue(Promise.resolve()) as any,
            cleanupGlobalNetwork: jest.fn(),
            invalidateCache: jest.fn(),
        } as unknown as GunDBService;

        // Setup Mock ActivityPub
        apMock = {
            broadcastRelease: jest.fn(),
            broadcastDelete: jest.fn(),
            broadcastPost: jest.fn(),
            broadcastPostDelete: jest.fn(),
        } as unknown as ActivityPubService;

        // Setup Config
        configMock = {
            publicUrl: 'https://test.tunecamp.org',
            siteName: 'Test Site',
        } as any;

        // Create Service
        publishingService = createPublishingService(db, gundbMock, apMock, configMock);

        // Populate minimal data
        db.createArtist('Test Artist');
        // We need settings for site info
        db.setSetting('publicUrl', 'https://test.tunecamp.org');
        db.setSetting('siteName', 'Test Site');
        db.setSetting('artistName', 'Test Artist');
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('should call unregisterTracks when album visibility changes to private', async () => {
        // 1. Create an album (initially public)
        const albumId = db.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
            artist_id: 1,
            date: '2023-01-01',
            is_public: true,
            visibility: 'public',
            is_release: true,
            published_to_gundb: true,
            published_to_ap: true,
            cover_path: null,
            genre: null,
            description: null,
            download: null,
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023
        });

        // Add a track
        db.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: 1,
            track_num: 1,
            duration: 100,
            file_path: 'test.mp3',
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            lossless_path: null,
            waveform: null
        });

        // 2. Sync (should register)
        // Manually fix published_to_gundb because createAlbum might be buggy
        db.updateAlbumFederationSettings(albumId, true, true);

        await publishingService.syncRelease(albumId);
        expect(gundbMock.registerTracks).toHaveBeenCalled();
        expect(gundbMock.unregisterTracks).not.toHaveBeenCalled();

        // 3. Change to private
        db.updateAlbumVisibility(albumId, 'private');

        // Verify state
        const album = db.getAlbum(albumId);
        expect(album?.visibility).toBe('private');
        expect(album?.is_public).toBe(0);

        // 4. Sync (should unregister)
        // Reset mocks to be sure
        (gundbMock.registerTracks as jest.Mock).mockClear();
        (gundbMock.unregisterTracks as jest.Mock).mockClear();

        await publishingService.syncRelease(albumId);

        expect(gundbMock.unregisterTracks).toHaveBeenCalled();
        expect(gundbMock.registerTracks).not.toHaveBeenCalled();

        // Verify arguments passed to unregisterTracks
        const callArgs = (gundbMock.unregisterTracks as jest.Mock).mock.calls[0] as any[];
        const passedAlbum = callArgs[1];
        expect(passedAlbum.id).toBe(albumId);
    });

    test('should call unregisterTracks when published_to_gundb is toggled off', async () => {
        // 1. Create an album (public + published)
        const albumId = db.createAlbum({
            title: 'Test Album 2',
            slug: 'test-album-2',
            artist_id: 1,
            date: '2023-01-01',
            is_public: true,
            visibility: 'public',
            is_release: true,
            published_to_gundb: true,
            published_to_ap: true,
            cover_path: null,
            genre: null,
            description: null,
            download: null,
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023
        });

        // Manually fix published_to_gundb because createAlbum might be buggy
        db.updateAlbumFederationSettings(albumId, true, true);

        await publishingService.syncRelease(albumId);
        expect(gundbMock.registerTracks).toHaveBeenCalled();

        // 2. Toggle off GunDB publishing (but keep public)
        db.updateAlbumFederationSettings(albumId, false, true);

        // 3. Sync
        (gundbMock.registerTracks as jest.Mock).mockClear();
        (gundbMock.unregisterTracks as jest.Mock).mockClear();

        await publishingService.syncRelease(albumId);

        expect(gundbMock.unregisterTracks).toHaveBeenCalled();
    });
});
