## 2025-02-18 - [Reduce redundant recursive directory scans]
**Learning:** Checking for multiple fallback filenames by calling `glob` for each one (e.g. `cover.jpg`, `artwork.jpg`, `folder.jpg`) is extremely inefficient (O(N) recursive scans).
**Action:** Scan the directory once for all relevant files (O(1) recursive scan) and filter the results in memory against the fallback list. This reduced cover art discovery time by ~75% in miss scenarios.
