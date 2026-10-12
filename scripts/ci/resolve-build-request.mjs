// Native build authorization (docs/RELEASING.md, docs/ACTIONS-BUDGET.md).
//
// An APK build starts only from an explicit request that names the approved
// source commit; a version bump, a branch push or an OTA never starts one.
// A request is either
//   - a manual run of "APK Build" (workflow_dispatch inputs), or
//   - a commit that changes .github/build-request.json (auditable in git; this
//     is the path an agent session can use, since it cannot dispatch).
//
// The build is made from EXACTLY `sourceSha` (not from the commit that carries
// the request), so every artifact traces to one approved revision and a
// rebuild never needs a version bump.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

export const PLATFORMS = ['android'];
export const CHANNELS = ['preview'];
export const REQUEST_FILE = '.github/build-request.json';

/**
 * Validate a raw request and return the normalised one.
 * @returns {{sourceSha:string, platform:string, channel:string, publishRelease:boolean, expectedVersion:number|null, id:string}}
 */
export function normaliseRequest(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sourceSha = String(r.sourceSha ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('sourceSha must be the full 40-character commit SHA of the approved source (not a branch name or abbreviation)');
  }
  const platform = String(r.platform ?? 'android').trim().toLowerCase();
  if (!PLATFORMS.includes(platform)) throw new Error(`platform "${platform}" is not supported by this repository (supported: ${PLATFORMS.join(', ')})`);
  const channel = String(r.channel ?? 'preview').trim().toLowerCase();
  if (!CHANNELS.includes(channel)) throw new Error(`channel "${channel}" is not allowed here (allowed: ${CHANNELS.join(', ')}; production builds use production-build.yml)`);
  const pr = r.publishRelease;
  const publishRelease = pr === undefined || pr === null || pr === '' ? true : pr === true || pr === 'true';
  let expectedVersion = null;
  if (r.expectedVersion !== undefined && r.expectedVersion !== null && String(r.expectedVersion).trim() !== '') {
    const n = Number(r.expectedVersion);
    if (!Number.isInteger(n) || n < 1) throw new Error('expectedVersion must be a positive integer public version');
    expectedVersion = n;
  }
  return { sourceSha, platform, channel, publishRelease, expectedVersion, id: String(r.id ?? '').slice(0, 80) };
}

/** The source must be part of the history of the commit that carries the request. */
export function assertAncestor(sourceSha, headSha, run = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) {
  try {
    run(['cat-file', '-e', `${sourceSha}^{commit}`]);
  } catch {
    throw new Error(`sourceSha ${sourceSha} does not exist in this repository`);
  }
  try {
    run(['merge-base', '--is-ancestor', sourceSha, headSha]);
  } catch {
    throw new Error(`sourceSha ${sourceSha} is not an ancestor of ${headSha}: the build must come from this branch's own history`);
  }
}

export function requestFromEnv(env, readFile = (p) => readFileSync(p, 'utf8')) {
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    return {
      sourceSha: env.IN_SOURCE_SHA,
      platform: env.IN_PLATFORM,
      channel: env.IN_CHANNEL,
      publishRelease: env.IN_PUBLISH_RELEASE,
      expectedVersion: env.IN_EXPECTED_VERSION,
      id: 'manual',
    };
  }
  return JSON.parse(readFile(REQUEST_FILE));
}

export function main(env = process.env) {
  const req = normaliseRequest(requestFromEnv(env));
  assertAncestor(req.sourceSha, env.GITHUB_SHA || 'HEAD');
  const out = {
    source_sha: req.sourceSha,
    platform: req.platform,
    channel: req.channel,
    publish_release: String(req.publishRelease),
    expected_version: req.expectedVersion === null ? '' : String(req.expectedVersion),
    request_commit: env.GITHUB_SHA || '',
    request_ref: env.GITHUB_REF_NAME || '',
  };
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k}=${v}`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(`::error::build request refused: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
