// Small CI helpers shared by the workflows (pure decisions are exported
// and unit-tested in tests/ciGate.test.ts):
//
//   node scripts/ci/publish-gate.mjs newest [--lenient]
//       "Is this run's commit still the newest publishable commit of the
//       branch?"  Writes `current=true|false` to $GITHUB_OUTPUT.
//       Used by eas-update.yml before the emulator job (--lenient: if the
//       branch head cannot be read, do not stand down) and before
//       publishing (strict: an error fails the job).
//
//   node scripts/ci/publish-gate.mjs standalone
//       "Will eas-update.yml run for this push anyway?" For the
//       standalone push runs of ci.yml / android-render-check.yml.
//       Reads EVENT_BEFORE (github.event.before). Writes `run=true|false`.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { touchesPublishedPaths } from './publish-paths.mjs';

const ZERO_SHA = /^0+$/;
// GitHub evaluates push path filters against at most 300 changed files;
// beyond that we cannot know what it decided, so we do not stand down.
export const GITHUB_DIFF_LIMIT = 300;

/**
 * Same decision as the former inline shell step of eas-update.yml:
 * - head == this commit            -> current
 * - this commit left the branch    -> not current (nothing to publish)
 * - newer commits only touch paths that never publish -> current (no
 *   run of theirs will publish, so this one must)
 * - otherwise a newer run publishes -> not current
 */
export function decideNewest({ sha, headSha, isAncestor, changedFiles }) {
  if (headSha === sha) return { current: true, notice: `${sha} is the branch head` };
  if (!isAncestor) return { current: false, notice: `Not publishing ${sha}: it is no longer on the branch (head ${headSha})` };
  if (!touchesPublishedPaths(changedFiles)) {
    return { current: true, notice: `Newer commits only touch paths that don't publish; publishing ${sha}` };
  }
  return { current: false, notice: `Not publishing ${sha}: ${headSha} carries newer app changes and publishes itself` };
}

/**
 * For a standalone push run of ci.yml / android-render-check.yml on the
 * publishing branch: run only if eas-update.yml (which already contains
 * this work) will NOT start for the push. Fail-safe: whenever unsure,
 * run (a duplicate is acceptable, an unvalidated push is not).
 */
export function decideStandalone({ before, changedFiles, listingFailed }) {
  if (!before || ZERO_SHA.test(before) || listingFailed) return { run: true, notice: 'cannot tell what the push changed: running' };
  if (changedFiles.length === 0) return { run: true, notice: 'empty diff (force push / re-push?): running' };
  if (changedFiles.length >= GITHUB_DIFF_LIMIT) return { run: true, notice: `${changedFiles.length} changed files (GitHub path filters stop at ${GITHUB_DIFF_LIMIT}): running` };
  if (touchesPublishedPaths(changedFiles)) return { run: false, notice: 'this push publishes: eas-update.yml runs the same checks, standing down' };
  return { run: true, notice: 'only non-publishing paths changed: eas-update.yml does not start, running' };
}

const vcs = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);
const out = (k, v) => {
  console.log(`${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};
const notice = (m) => console.log(`::notice::${m}`);

function runNewest(lenient) {
  const { GITHUB_REF: ref, GITHUB_SHA: sha } = process.env;
  try {
    vcs('fetch', '--no-tags', '--quiet', 'origin', ref);
    const headSha = vcs('rev-parse', 'FETCH_HEAD');
    console.log(`branch head: ${headSha}  this run: ${sha}`);
    let isAncestor = true;
    try { vcs('merge-base', '--is-ancestor', sha, headSha); } catch { isAncestor = false; }
    const changedFiles = headSha !== sha && isAncestor ? lines(vcs('diff', '--name-only', sha, headSha)) : [];
    const d = decideNewest({ sha, headSha, isAncestor, changedFiles });
    notice(d.notice);
    out('current', d.current);
  } catch (e) {
    if (!lenient) throw e;
    notice(`could not read the branch head (${e.message}); not standing down`);
    out('current', true);
  }
}

function runStandalone() {
  const { GITHUB_SHA: sha, EVENT_BEFORE: before } = process.env;
  let changedFiles = [];
  let listingFailed = false;
  try {
    if (before && !ZERO_SHA.test(before)) {
      try { vcs('cat-file', '-e', `${before}^{commit}`); } catch { vcs('fetch', '--no-tags', '--quiet', '--depth=1', 'origin', before); }
      changedFiles = lines(vcs('diff', '--name-only', before, sha));
    }
  } catch { listingFailed = true; }
  const d = decideStandalone({ before, changedFiles, listingFailed });
  notice(d.notice);
  out('run', d.run);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...flags] = process.argv.slice(2);
  if (cmd === 'newest') runNewest(flags.includes('--lenient'));
  else if (cmd === 'standalone') runStandalone();
  else { console.error('usage: publish-gate.mjs newest [--lenient] | standalone'); process.exit(2); }
}
