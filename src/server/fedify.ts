import crypto from "crypto";
import { createFederation, Person, Endpoints, CryptographicKey, type Federation } from "@fedify/fedify";
import { BetterSqliteKvStore } from "./fedify-kv.js";
import type { DatabaseService } from "./database.js";
import type { ServerConfig } from "./config.js";

export function createFedify(dbService: DatabaseService, config: ServerConfig): Federation<void> {
    const db = dbService.db;
    const kv = new BetterSqliteKvStore(db);

    const federation = createFederation<void>({
        kv,
    });

    // Validates actor handles: @slug@domain
    federation.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
        const artist = dbService.getArtistBySlug(handle);
        if (!artist) return null;

        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        // Avoid strict dependency on publicUrl just for object construction if internal, 
        // but robust federation needs it.
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;

        // Construct Person object
        // TODO: Use more comprehensive mapping from Artist -> Person
        return new Person({
            id: new URL(`/users/${artist.slug}`, baseUrl),
            preferredUsername: artist.slug,
            name: artist.name,
            summary: artist.bio || "",
            // inbox: new URL(`/users/${artist.slug}/inbox`, baseUrl), // inbox is property of Actor? Person extends Actor.
            inbox: new URL(`/users/${artist.slug}/inbox`, baseUrl),
            endpoints: new Endpoints({
                sharedInbox: new URL("/inbox", baseUrl)
            }),
            publicKey: new CryptographicKey({
                id: new URL(`/users/${artist.slug}#main-key`, baseUrl),
                owner: new URL(`/users/${artist.slug}`, baseUrl),
                publicKey: artist.public_key || ""
            })
        });
    })
        .setKeyPairsDispatcher(async (ctx, handle) => {
            const artist = dbService.getArtistBySlug(handle);
            if (!artist || !artist.private_key || !artist.public_key) return []; // Return empty array if not found

            return [{
                privateKey: crypto.createPrivateKey(artist.private_key),
                publicKey: crypto.createPublicKey(artist.public_key)
            }];
        });

    return federation;
}
