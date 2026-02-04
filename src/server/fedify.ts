import { createFederation, Person, ExportPubK, Endpoints, Context } from "@fedify/fedify";
import { BetterSqliteKvStore } from "./fedify-kv.js";
import type { DatabaseService } from "./database.js";
import type { ServerConfig } from "./config.js";

export function createFedify(dbService: DatabaseService, config: ServerConfig) {
    const db = dbService.db;
    const kv = new BetterSqliteKvStore(db);

    const federation = createFederation({
        kv,
    });

    // Validates actor handles: @slug@domain
    federation.setActorDispatcher("/users/{slug}", async (ctx: Context<void>, slug: string) => {
        const artist = dbService.getArtistBySlug(slug);
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
            inbox: new URL(`/users/${artist.slug}/inbox`, baseUrl),
            sharedInbox: new URL("/inbox", baseUrl),
            endpoints: new Endpoints({
                sharedInbox: new URL("/inbox", baseUrl)
            }),
            publicKey: new ExportPubK({
                id: new URL(`/users/${artist.slug}#main-key`, baseUrl),
                owner: new URL(`/users/${artist.slug}`, baseUrl),
                publicKeyPem: artist.public_key || ""
            })
        });
    });

    federation.setKeyPairsDispatcher(async (ctx: Context<void>, handle: string) => {
        const artistName = handle.split("@")[0]; // handle is "slug" (from path var) if aligned with dispatcher?
        // Wait, KeyPairsDispatcher `handle` arg depends on how it's invoked.
        // Actually Fedify passes the `handle` captured from the URI if using setKeyPairsDispatcher appropriately.
        // If we set it globally, `handle` is the structure. 
        // The first argument is Context, second is the Handle (if scoped) or we access it.

        // Actually, for setKeyPairsDispatcher the second arg is the handle/identifier.
        // In our case, the Actor URI is `/users/{slug}` so `slug` is what we likely get 
        // OR we just query DB based on the full URI.

        // Let's assume strict mapping for now.
        // Fedify docs: setKeyPairsDispatcher(path, (ctx, ...args) => ...)

        // Wait, typical pattern:
        // federation.setKeyPairsDispatcher(async (ctx, id) => { ... }) where id is the actor ID? 
        // No, it usually works in tandem with the Actor Dispatcher.
        return [];
    });

    // Explicit Key Pair dispatcher linking to the same path pattern
    federation.setKeyPairsDispatcher("/users/{slug}", async (ctx: Context<void>, slug: string) => {
        const artist = dbService.getArtistBySlug(slug);
        if (!artist || !artist.private_key || !artist.public_key) return null;

        return [{
            privateKey: artist.private_key,
            publicKey: artist.public_key
        }];
    });

    return federation;
}
