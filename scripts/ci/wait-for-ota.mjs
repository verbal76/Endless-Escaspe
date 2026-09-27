// Polls the update server exactly as an installed APK does until the
// update it serves was built from EXPECT_SHA (the commit under test),
// so the emulator run below exercises this commit's JS.
import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const runtime = app.runtimeVersion?.policy === 'appVersion' ? app.version : app.runtimeVersion;
const channel = app.updates.requestHeaders['expo-channel-name'];
const want = String(process.env.EXPECT_SHA).toLowerCase();
const deadline = Date.now() + Number(process.env.WAIT_MINUTES ?? 20) * 60_000;

async function served() {
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
  const start = body.indexOf('{"id"');
  if (!res.ok || start < 0) return null;
  let depth = 0;
  let end = start;
  for (; end < body.length; end++) {
    if (body[end] === '{') depth++;
    else if (body[end] === '}' && --depth === 0) break;
  }
  const m = JSON.parse(body.slice(start, end + 1));
  return { id: m.id, release: m.extra?.expoClient?.extra?.release ?? {} };
}

for (;;) {
  const s = await served().catch(() => null);
  if (s && s.release.gitSha === want) {
    console.log(`served update ${s.id} (OTA ${s.release.otaSequence}) is from ${want}`);
    break;
  }
  if (Date.now() > deadline) {
    console.error(`timed out: server still serves ${JSON.stringify(s)}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
