# Project Progress

## Current Status
-   **Version**: 2.0.0
-   **Stability**: Stable core for Static Generation. Server Mode is active and functional.

## Recent Developments
-   **Gleam Integration**: Successfully integrated Gleam for string and audio utilities (`src/gleam`, `src/gleam_generated`).
-   **Server Mode**: Enhanced with ActivityPub support (`src/server/activitypub.ts`, `src/server/routes/activitypub.ts`).
-   **Docker**: Dockerfile available for containerized deployment.
-   **Web Interface**: Improved Reactivity and UI in `webapp/`.
-   **Admin-Artist Linking**: Granular permissions allowing admins to be linked to specific artists.
-   **ActivityPub Privacy**: Automatic deletion broadcast for private tracks.
-   **Key Management**: Secure Identity management for Root Admins and viewing keys for Artists.

## Active Areas
-   **ActivityPub**: Federation features (Inbox/Outbox, Follows, Posts) are largely implemented and functional.
-   **Custom Posts**: Added backend and frontend support for artist microblogging.
-   **Documentation**: Improving context for AI and developers (`docs/`).
