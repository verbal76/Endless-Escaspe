// Post-publish check run by eas-update.yml: ask the update server for
// the latest update exactly as an installed APK does (same project
// URL, platform, runtime version and channel header, all read from
// app.json) and fail unless it serves the update we just published,
// carrying our release metadata. This proves the published update is
// what a compatible installed APK will actually receive.
import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const published = JSON.parse(readFileSync('update.json', 'utf8'));
const mine = (Array.isArray(published) ? published : [published]).find((u) => u.platform === 'android');
if (!mine) throw new Error('no android update in update.json');

const runtime = app.runtimeVersion?.policy === 'appVersion' ? app.version : app.runtimeVersion;
const channel = app.updates.requestHeaders['expo-channel-name'];
const res = await fetch(app.updates.url, {
  headers: {
    'expo-platform': 'android',
    'expo-runtime-version': String(runtime),
    'expo-channel-name': channel,
    'expo-protocol-version': '1',
    accept: 'multipart/mixed,application/expo+json,application/json',
  },
});
const body = await res.text();
if (!res.ok) throw new Error(`update server ${res.status}: ${body.slice(0, 300)}`);
// Multipart: the manifest part is the JSON object with an "id".
const start = body.indexOf('{"id"');
if (start < 0) throw new Error(`no manifest in response: ${body.slice(0, 300)}`);
let depth = 0;
let end = start;
for (; end < body.length; end++) {
  if (body[end] === '{') depth++;
  else if (body[end] === '}' && --depth === 0) break;
}
const manifest = JSON.parse(body.slice(start, end + 1));
const release = manifest.extra?.expoClient?.extra?.release ?? {};
const report = {
  requested: { runtime, channel, platform: 'android' },
  served: { id: manifest.id, runtimeVersion: manifest.runtimeVersion, createdAt: manifest.createdAt, release },
  published: { id: mine.id, group: mine.group, runtimeVersion: mine.runtimeVersion },
};
console.log(JSON.stringify(report, null, 2));
const problems = [];
if (manifest.id !== mine.id) problems.push(`server serves ${manifest.id}, not the update just published (${mine.id})`);
if (manifest.runtimeVersion !== String(runtime)) problems.push(`runtime ${manifest.runtimeVersion} != ${runtime}`);
if (String(release.otaSequence) !== String(process.env.EE_OTA_SEQUENCE)) problems.push(`otaSequence ${release.otaSequence} != ${process.env.EE_OTA_SEQUENCE}`);
if (release.gitSha !== String(process.env.EE_GIT_SHA).toLowerCase()) problems.push(`gitSha ${release.gitSha} != ${process.env.EE_GIT_SHA}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`OK: runtime ${runtime} / channel ${channel} devices will receive update ${mine.id}`);
