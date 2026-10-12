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

// The studio standard names three targets, all built from the same source (docs/PLATFORM_SUPPORT.md).
// A GitHub Release is coordinated: it needs platform "all", so a partial release can never be published.
export const PLATFORMS = ['android', 'windows', 'linux', 'all'];
export const DESTINATIONS = ['github_releases', 'local_only'];
export const CHANNELS = ['preview'];
export const REQUEST_FILE = '.github/build-request.json';

/**
 * Validate a raw request and return the normalised one.
 * @returns {{sourceSha:string, platform:string, buildNumber:number, destination:string, channel:string, id:string}}
 */
export function normaliseRequest(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sourceSha = String(r.sourceSha ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('sourceSha must be the full 40-character commit SHA of the approved source (not a branch name or abbreviation)');
  }
  const platform = String(r.platform ?? 'all').trim().toLowerCase();
  if (!PLATFORMS.includes(platform)) throw new Error(`platform "${platform}" is unknown (expected one of ${PLATFORMS.join(', ')})`);
  const buildNumber = Number(r.buildNumber);
  if (!Number.isInteger(buildNumber) || buildNumber < 1) throw new Error('buildNumber must be the positive integer build number of this release (release.json publicVersion)');
  const destination = String(r.destination ?? 'github_releases').trim().toLowerCase();
  if (!DESTINATIONS.includes(destination)) throw new Error(`destination "${destination}" is not allowed (allowed: ${DESTINATIONS.join(', ')})`);
  if (destination === 'github_releases' && platform !== 'all') {
    throw new Error(`destination github_releases needs platform "all" (got "${platform}"): a coordinated release carries the APK, the Windows zip and the Linux archive of one build, never a partial set. Use destination local_only for a single-platform build`);
  }
  const channel = String(r.channel ?? 'preview').trim().toLowerCase();
  if (!CHANNELS.includes(channel)) throw new Error(`channel "${channel}" is not allowed here (allowed: ${CHANNELS.join(', ')}; production builds use production-build.yml)`);
  return { sourceSha, platform, buildNumber, destination, channel, id: String(r.id ?? '').slice(0, 80) };
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

/**
 * Single authoritative line: a release build may only come from a commit ON that
 * line, i.e. an ancestor of the authoritative branch tip (already integrated) or a
 * descendant of it (a workspace branch built on top of it). A commit on an
 * abandoned or diverged branch (main, old experiment branches) is refused, so an
 * outdated branch can never be published silently.
 */
export function assertOnAuthoritativeLine(sourceSha, authoritativeBranch, run = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) {
  if (!authoritativeBranch) throw new Error('release.json must name the authoritativeBranch');
  const tip = `origin/${authoritativeBranch}`;
  try {
    run(['rev-parse', '--verify', `${tip}^{commit}`]);
  } catch {
    throw new Error(`cannot find the authoritative branch ${tip} (fetch full history)`);
  }
  const isAncestor = (a, b) => {
    try {
      run(['merge-base', '--is-ancestor', a, b]);
      return true;
    } catch {
      return false;
    }
  };
  if (isAncestor(sourceSha, tip) || isAncestor(tip, sourceSha)) return;
  throw new Error(`sourceSha ${sourceSha} is on neither side of ${authoritativeBranch}: it comes from a diverged or abandoned line. Rebase / merge it onto the authoritative line first (CLAUDE.md "Single source of truth")`);
}

export function requestFromEnv(env, readFile = (p) => readFileSync(p, 'utf8')) {
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    return {
      sourceSha: env.IN_SOURCE_SHA,
      platform: env.IN_PLATFORM,
      buildNumber: env.IN_BUILD_NUMBER,
      destination: env.IN_DESTINATION,
      channel: env.IN_CHANNEL,
      id: 'manual',
    };
  }
  return JSON.parse(readFile(REQUEST_FILE));
}

export function main(env = process.env) {
  const req = normaliseRequest(requestFromEnv(env));
  assertAncestor(req.sourceSha, env.GITHUB_SHA || 'HEAD');
  const authoritative = JSON.parse(readFileSync('release.json', 'utf8')).authoritativeBranch;
  assertOnAuthoritativeLine(req.sourceSha, authoritative);
  const out = {
    source_sha: req.sourceSha,
    platform: req.platform,
    channel: req.channel,
    build_number: String(req.buildNumber),
    destination: req.destination,
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
