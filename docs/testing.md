# Testing

- `npm run typecheck` and `npm test` (Node test runner over `tests/*.test.ts`) are
  the fast checks CI runs on every push.
- Browser scenarios (`scripts/scenarios/`) run the real game in headless
  Chromium against a web export and step the simulation frame by frame, so
  results are identical at any CPU load. They are not part of `npm test` and
  need Playwright, which is deliberately not a dependency (it would change
  `package.json` / `package-lock.json`, which feed the native fingerprint):

  ```sh
  npm i --no-save playwright
  node scripts/scenarios/run.mjs --pack all         # about 35 s after the first build
  node scripts/scenarios/run.mjs --only endless     # one subsystem (tags: stealth, combat, campaign, endless, daily, economy, ui)
  node scripts/scenarios/run.mjs --pack regressions # guards for fixed review defects (about 6 s)
  ```

  See `scripts/scenarios/README.md` (how it works, writing scenarios),
  `scripts/scenarios/CI-NOTES.md` (a CI job and tag-to-path mapping) and
  `scripts/scenarios/PRODUCTION-CHANGES-NEEDED.md` (optional src changes).
