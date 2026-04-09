# Roles & Permissions in TuneCamp

This document describes the different roles within a TuneCamp instance, their capabilities, and their associated security constraints.

TuneCamp uses a Role-Based Access Control (RBAC) system to ensure that each user can only operate within the scope of their assigned role.

---

## 1. Root Admin (Superuser)
The **Root Admin** is the instance owner or primary system administrator. This typically corresponds to the first user created (ID 1).

### Exclusive Capabilities:
- **Global Site Management:** Modify the site name, description, public URL, logos, and background images.
- **Web3 Configuration:** Set wallet addresses for USDC/USDT payments and NFT contracts.
- **Full User Management:**
  - Create new admins and users.
  - Enable/Disable accounts.
  - Reset passwords for any user.
  - Delete accounts (except their own or the last remaining admin).
- **System Identity Management:** Access and modify the instance's GunDB and ActivityPub cryptographic keys.
- **System Maintenance:**
  - Consolidate files on the filesystem.
  - Global GunDB network cleanup.
  - Force network synchronization.
- **Total Visibility:** Access to all releases and global statistics across all artists on the instance.

### Security Constraints:
- Cannot be deleted.
- Cannot be disabled.
- Cannot be demoted to a lower role.

---

## 2. Admin (Standard Administrator)
The **Admin** is a user with delegated administrative powers, useful for managing the community and content without having full server control.

### Capabilities:
- **User Monitoring:** Can view the list of registered users (but cannot modify or delete them).
- **Federated Network Management:**
  - Follow or unfollow other ActivityPub instances/actors.
  - Synchronize content from federated peers.
- **Content Management:** Can manage their own releases and social posts.
- **Artist Support:** If assigned to an artist profile, can operate as that artist.
- **Post Moderation:** Can view and manage posts and comments (if implemented in the moderation system).

### Security Constraints:
- Cannot modify global site settings.
- Cannot access server identity keys.
- Cannot reset other users' passwords.

---

## 3. Artist / User (Standard User)
The **Artist** (or standard user) represents the user who publishes music and interacts with the platform. Every user in TuneCamp is associated with an artist profile.

### Capabilities:
- **Discography Management:**
  - Upload audio tracks (MP3, FLAC, etc.).
  - Create and edit albums and formal releases.
  - Manage metadata (titles, genres, licenses).
  - Set prices (ETH, USD, USDC, USDT) and visibility (public, private, unlisted).
- **Social Feed:** Create, edit, and delete posts for their own profile.
- **Artist Profile:** Edit biography, external links, avatar, and cover images.
- **Personal Statistics:** View play and sales data related to their own content.
- **Subsonic Access:** Use their credentials for streaming via Subsonic-compatible apps.
- **Password Management:** Change their own password.

### Security Constraints:
- **Storage Quota:** Subject to a disk space limit (storage quota) configured by the administrator.
- **Activation:** Must be activated (`isActive`) by an administrator before being able to upload or edit content (if the configuration requires it).
- **Isolation:** Cannot view or modify other artists' content.
- **Private Keys:** Can only view their own artist identity keys.

---

## Permission Matrix (Summary)

| Capability | Root Admin | Admin | Artist/User |
| :--- | :---: | :---: | :---: |
| Modify Site Settings | ✅ | ❌ | ❌ |
| Create/Delete Users | ✅ | ❌ | ❌ |
| Reset Other Users' Passwords | ✅ | ❌ | ❌ |
| Upload Music | ✅ | ✅ | ✅ (if active) |
| Manage Own Content | ✅ | ✅ | ✅ |
| Manage Others' Content | ✅ | ❌ | ❌ |
| Follow Remote Instances (AP) | ✅ | ✅ | ❌ |
| Access Server Keys | ✅ | ❌ | ❌ |
| Manage Storage Quotas | ✅ | ❌ | ❌ |

---

## Security Verification

TuneCamp implements these controls at the API level:
1. **JWT Middleware:** Every authenticated request verifies the role (`isAdmin`) and identity (`userId`).
2. **Content Ownership:** Modification APIs (`PUT`, `DELETE`) verify that `owner_id` matches the requester's `userId`, unless the requester is an administrator.
3. **SSRF Protection:** Network operations (ActivityPub follow) are protected against SSRF attacks via URL validation.
4. **Sanitization:** File names and metadata are sanitized to prevent Path Traversal and XSS attacks.
5. **Quota Check:** During upload, the user's available disk space is dynamically verified before accepting files.
