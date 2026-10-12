// Branch inventory: every remote branch must be accounted for in
// docs/branch-ledger.json (CLAUDE.md "Single source of truth"). Unmerged work
// must stay discoverable; no branch is ever deleted because it looks obsolete.
//
// Usage: node scripts/ci/branch-inventory.mjs [--strict]
//   default : prints ::warning:: for every unaccounted branch, exits 0
//   --strict: exits 1 when any remote branch is missing from the ledger
// Cheap (one `git ls-remote`, no checkout beyond the repo itself).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const LEDGER = 'docs/branch-ledger.json';

export function parseLsRemoteHeads(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\s+/)[1])
    .filter((ref) => ref && ref.startsWith('refs/heads/'))
    .map((ref) => ref.slice('refs/heads/'.length));
}

/** @returns {{unaccounted:string[], stale:string[]}} */
export function compare(remoteBranches, ledger) {
  const known = new Set(ledger.branches.map((b) => b.name));
  return {
    unaccounted: remoteBranches.filter((b) => !known.has(b)).sort(),
    stale: [...known].filter((b) => !remoteBranches.includes(b)).sort(),
  };
}

export function validateLedger(ledger) {
  const errors = [];
  const allowed = new Set(ledger.classifications);
  const names = new Set();
  for (const b of ledger.branches) {
    if (names.has(b.name)) errors.push(`duplicate ledger entry ${b.name}`);
    names.add(b.name);
    if (!allowed.has(b.class)) errors.push(`${b.name}: unknown classification ${b.class}`);
    if (!b.note || !b.disposition) errors.push(`${b.name}: note and disposition are required`);
  }
  if (!names.has(ledger.authoritativeBranch)) errors.push('the authoritative branch must have a ledger entry');
  const auth = ledger.branches.filter((b) => b.class === 'authoritative');
  if (auth.length !== 1) errors.push(`exactly one authoritative branch required, found ${auth.length}`);
  return errors;
}

export function main(argv, run = () => execFileSync('git', ['ls-remote', '--heads', 'origin'], { encoding: 'utf8' })) {
  const strict = argv.includes('--strict');
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const errors = validateLedger(ledger);
  const { unaccounted, stale } = compare(parseLsRemoteHeads(run()), ledger);
  for (const e of errors) console.log(`::error::branch ledger: ${e}`);
  for (const b of unaccounted) console.log(`::warning::remote branch "${b}" is not in ${LEDGER}: classify it (integrated / recover / superseded ...) before its work can be forgotten`);
  for (const b of stale) console.log(`::notice::ledger lists "${b}" but it is no longer on the remote`);
  console.log(`branch inventory: ${ledger.branches.length} ledger entries, ${unaccounted.length} unaccounted, ${stale.length} no longer on the remote`);
  const bad = errors.length > 0 || (strict && unaccounted.length > 0);
  return bad ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
