# Changelog

## [2.0.0] - 2026-04-09

### Added
- GitHub Actions CI workflow to run Jest tests automatically.
- Jest testing suite covering the core `EmotionEngine`, `StarNamer`, and `ConstellationEngine`.
- Configured Jest as the default test runner in `package.json`.
- Configured ESLint to enforce code consistency.

### Changed
- Refactored `src/store.js` database operations to be completely `async`, preventing main thread blocking.
- Extracted and generalized the `calculateEchoRing` helper function in `renderer/app.js`.
- Refactored `updateLightEcho` for better readability.
- Replaced `catch(e)` generically hiding errors to properly logged error messages using `console.warn` and `console.error` across the codebase (`renderer/time-engine.js`, `renderer/celestial-renderer.js`, `renderer/wspr-client.js`, `renderer/app.js`).
- Set `process.env.NASA_API_KEY` for safer API configuration with `DEMO_KEY` fallback.
- Updated `README.md` to indicate performance optimizations and CI test hardening.

### Fixed
- Optimized `computeMST` in `src/constellation-engine.js` by removing square root operations, which speeds up the $O(n^2)$ algorithm.
- Optimized `computeFilaments` in `renderer/app.js` by pre-calculating the norms to avoid redundant $O(n^2)$ operations in the nested iteration.
- Pinned dependency versions in `package.json` to prevent arbitrary breaking changes.
- Addressed dependency vulnerabilities using `npm audit fix`.