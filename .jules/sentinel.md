# Sentinel's Journal

## 2024-05-24 - [IDOR in Track Upload]
**Vulnerability:** Restricted admins (artist-specific) could upload tracks to any release by manipulating `releaseSlug` in the request body, bypassing ownership checks.
**Learning:** Multer processes files before the route handler, but the route handler logic used `req.body` (releaseSlug) to determine the target release without validating if the authenticated user (`req.artistId`) owned that release.
**Prevention:** Always validate ownership of the target resource (release) against the authenticated user (artistId) immediately after retrieving the resource and before performing any file operations or database links.
