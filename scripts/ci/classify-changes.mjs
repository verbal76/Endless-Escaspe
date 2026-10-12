// Decides whether a pull request changes only documentation, so the cheap CI
// tier can skip installing and testing (docs/ACTIONS-BUDGET.md). The CI job
// still runs and reports success (a required check must never stay pending);
// it just does no heavy work.
//
// Usage: node scripts/ci/classify-changes.mjs <base-sha> <head-sha>
// Writes docs_only=true|false to $GITHUB_OUTPUT (and stdout). Any doubt
// (no files, git failure) means false: the full tier runs.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const DOC = [/^docs\//, /\.md$/i];

/** @param {string[]} files repo-relative paths changed by the PR */
export function isDocsOnly(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.every((f) => DOC.some((re) => re.test(f)));
}

export function changedFiles(base, head, run = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  const out = run(['diff', '--name-only', `${base}...${head}`]);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function main(argv, env = process.env) {
  let docsOnly = false;
  try {
    const [base, head] = argv;
    if (base && head) docsOnly = isDocsOnly(changedFiles(base, head));
  } catch {
    docsOnly = false;
  }
  const line = `docs_only=${docsOnly}`;
  console.log(line);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, line + '\n');
  return docsOnly;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
