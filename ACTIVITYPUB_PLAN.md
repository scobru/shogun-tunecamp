# ActivityPub Interactions Plan

The goal of this phase is to turn Tunecamp from a "read-only" node (discoverable via NodeInfo and WebFinger) into an interactive Fediverse participant capable of receiving and processing activities like `Follow`, `Like`, and `Announce` (Boost).

## Proposed Changes

### Database Schema Updates

We need new tables to persist federation interactions so we can display them in the UI and respond appropriately.

#### [MODIFY] `src/server/database.ts`

- **New Table `followers`**:
  - `id` (INTEGER PRIMARY KEY)
  - `follower_fid` (TEXT UNIQUE) - The remote actor's URI
  - `inbox_url` (TEXT) - The remote actor's inbox for sending updates
  - `status` (TEXT) - 'pending', 'accepted'
  - `created_at` (DATETIME)
- **New Table `likes`**:
  - `id` (INTEGER PRIMARY KEY)
  - `remote_actor_fid` (TEXT)
  - `object_type` (TEXT) - 'album', 'track'
  - `object_id` (INTEGER)
  - `created_at` (DATETIME)
- **Update Migrations**: Add the schema creation to the `init()` method.

### Fedify Inbox Handlers

Fedify uses predefined dispatchers to handle incoming inbox messages. We need to implement the handlers for specific `Activity` types.

#### [MODIFY] `src/server/ap.ts` (or `activitypub.ts`)

- **Implement `on(Follow)` handler**:
  - Receive the `Follow` activity (e.g., a Mastodon user follows `@site@sudorecords.scobrudot.dev`).
  - Asynchronously dispatch an `Accept` activity back to the remote user's inbox to confirm the follow.
  - Save the follower in the new `followers` DB table.
- **Implement `on(Undo)` handler**:
  - Handle `Undo(Follow)` to remove the user from the `followers` table.
  - Handle `Undo(Like)` to remove likes from the `likes` table.
- **Implement `on(Like)` handler**:
  - Parse the `object` field (which will be a note/audio URI from our server, e.g., `https://sudorecords.scobrudot.dev/releases/my-album`).
  - Find the corresponding Album/Track in the database.
  - Increment the local like count to display in the frontend.
- **Implement `on(Announce)` handler**:
  - Handle boosts/reposts natively.

### Outbound Activities (Broadcasting)

When Tunecamp publishes a new Release or Track, it should notify all its followers.

#### [NEW] `src/server/federation/broadcaster.ts`

- Create a service that hooks into the upload/scan process.
- When a new Release is created and marked public, fetch all `inbox_url`s from the `followers` table.
- Construct a `Create(Note or Audio)` ActivityPub object.
- Use Fedify's outbound client to send the signed payload to all followers' inboxes (Mastodon/Funkwhale will then show the new track in their home feeds).

## Verification Plan

### Automated Tests

- Create unit tests that mock incoming `Follow` and `Like` payloads from Mastodon and Funkwhale using `@fedify/fedify` testing utilities.
- Verify that the database correctly stores the relationship.

### Manual Verification

- Deploy to staging (`sudorecords.scobrudot.dev`).
- Use a real Mastodon/Funkwhale account to search for `@site@...` and click **Follow**.
- Check the server logs to verify the `Follow` was received and an `Accept` was sent back.
- Check the Mastodon UI to ensure the Follow request changed from "Requested" to "Following".
