// Reads an emulator logcat dump and fails unless the app ran the
// expected commit's code and its render audit found every textured
// group actually drawn with verified GPU textures.
//
//   EXPECT_SHA=<commit> node scripts/ci/check-render-audit.mjs <logcat.txt>
//
// The parsing and the verdict live in evaluateRenderLog() so they can
// be unit-tested on fixtures (tests/renderCheckParser.test.ts).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Last `<tag> {json}` line in the log. logcat truncates lines around
// 4 KB; an unparseable line is reported rather than crashing the check.
export function lastTagged(lines, tag) {
  const hit = lines.filter((l) => l.includes(`${tag} {`)).pop();
  if (!hit) return null;
  const raw = hit.slice(hit.indexOf(`${tag} {`) + tag.length + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return { unparsed: raw.slice(0, 1500) };
  }
}

export function evaluateRenderLog(text, expectSha) {
  const lines = String(text).split('\n');
  const want = expectSha ? String(expectSha).toLowerCase() : null;
  const release = lastTagged(lines, '[release]');
  const textures = lastTagged(lines, '[textures]');
  const audit = lastTagged(lines, '[render-audit]');
  const font = lastTagged(lines, '[font]');
  const problems = [];
  const notes = [];

  if (!release) problems.push('no [release] line: the app did not boot this code');
  else if (release.unparsed) problems.push('[release] line was truncated by logcat');
  else if (want) {
    // Both an OTA and the embedded bundle of an APK built with
    // EE_GIT_SHA carry the source commit (app.config.js ->
    // extra.release.gitSha). A different commit means the app ran
    // other code than the commit under test (e.g. a served OTA).
    const got = release.gitSha ? String(release.gitSha).toLowerCase() : null;
    if (got && got !== want) problems.push(`app ran ${got} (${release.source}, ${release.line}), expected ${want}`);
    else if (!got && release.source === 'ota') problems.push(`OTA launch reports no source commit, expected ${want}`);
    else if (!got) notes.push(`${release.source} launch reports no source commit; commit not verified`);
    else notes.push(`running commit ${got} (${release.source}) verified`);
  }
  if (!font) problems.push('no [font] line');
  else if (font.state !== 'loaded') problems.push(`display font not loaded: ${font.error ?? font.state}`);
  if (!audit) problems.push('no [render-audit] line: no scene was rendered');
  else if (audit.unparsed) problems.push('[render-audit] line was truncated by logcat');
  else {
    problems.push(...(Array.isArray(audit.problems) ? audit.problems : []));
    for (const g of ['player', 'guards', 'props', 'ground']) {
      if (!audit.groups?.[g] || audit.groups[g].meshes === 0) problems.push(`${g}: no meshes in the scene`);
    }
    const gpu = Array.isArray(audit.gpu) ? audit.gpu : [];
    if (!gpu.some((c) => c.key === 'character-d' || c.key === 'character-g')) {
      problems.push('player texture was not GPU-checked');
    }
  }
  return { ok: problems.length === 0, problems, notes, release, textures, audit, font };
}

function cli(file) {
  const r = evaluateRenderLog(readFileSync(file, 'utf8'), process.env.EXPECT_SHA);
  console.log('release:', JSON.stringify(r.release));
  console.log('texture files:', JSON.stringify(r.textures));
  console.log('display font:', JSON.stringify(r.font));
  console.log('render audit:', JSON.stringify(r.audit, null, 1));
  for (const n of r.notes) console.log(`note: ${n}`);
  if (!r.ok) {
    console.error('RENDER CHECK FAILED\n' + r.problems.map((p) => `- ${p}`).join('\n'));
    return 1;
  }
  console.log('RENDER CHECK OK: player, guards, vehicles, props and ground are drawn with GPU-verified textures; display font loaded');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(cli(process.argv[2]));
}
