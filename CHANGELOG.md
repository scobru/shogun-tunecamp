# Changelog

## [2.0.1] - 2026-02-21

### Fixed

- Resolved `better-sqlite3` native binding issues by standardizing on `npm` and removing conflicting `pnpm-lock.yaml` and `yarn.lock` files.
- Fixed `EBUSY` error in `activitypub.bench.test.ts` on Windows by adding robust cleanup logic in `afterAll` hook.
- Improved database cleanup in `auth.test.ts` and `activitypub.bench.test.ts` to prevent resource leaks during testing.

### Refactored

- Unified package management to use `npm` exclusively, ensuring consistent builds across different environments.
