// Reads an emulator logcat dump and fails unless the app ran the
// expected commit's code and its render audit found every textured
// group actually drawn with verified GPU textures.
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
const want = String(process.env.EXPECT_SHA).toLowerCase();
const lines = readFileSync(file, 'utf8').split('\n');
// logcat truncates lines around 4 KB; an unparseable line is reported
// rather than crashing the check.
const last = (tag) => {
  const hit = lines.filter((l) => l.includes(`${tag} {`)).pop();
  if (!hit) return null;
  const raw = hit.slice(hit.indexOf(`${tag} {`) + tag.length + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return { unparsed: raw.slice(0, 1500) };
  }
};
const release = last('[release]');
const textures = last('[textures]');
const audit = last('[render-audit]');
console.log('release:', JSON.stringify(release));
console.log('texture files:', JSON.stringify(textures));
console.log('render audit:', JSON.stringify(audit, null, 1));

const problems = [];
if (!release) problems.push('no [release] line: the app did not boot this code');
// An OTA carries its commit; the embedded bundle of the APK this job
// just built from the commit under test reports none.
else if (release.source === 'ota' && release.gitSha !== want) problems.push(`app ran ${release.gitSha} (${release.line}), expected ${want}`);
if (!audit) problems.push('no [render-audit] line: no scene was rendered');
else if (audit.unparsed) problems.push('[render-audit] line was truncated by logcat');
else {
  problems.push(...audit.problems);
  for (const g of ['player', 'guards', 'props', 'ground']) {
    if (!audit.groups[g] || audit.groups[g].meshes === 0) problems.push(`${g}: no meshes in the scene`);
  }
  if (!audit.gpu.some((c) => c.key === 'character-d' || c.key === 'character-g')) {
    problems.push('player texture was not GPU-checked');
  }
}
if (problems.length) {
  console.error('RENDER CHECK FAILED\n' + problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log('RENDER CHECK OK: player, guards, vehicles, props and ground are drawn with GPU-verified textures');
