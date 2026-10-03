import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSaves, writeSaves, parseSaves, newSave, saveSettings, loadSettings } from '/home/user/Endless-Escaspe/src/util/storage.ts';
import { applyRunResult } from '/home/user/Endless-Escaspe/src/util/economy.ts';
const P = 'endless-escaspe:saves:v1', B = 'endless-escaspe:saves:v1.bak';
const log = (k: string, v: unknown) => console.log(k, JSON.stringify(v));

// S1: primary is valid JSON but has an unrecognised shape (e.g. written by a newer bundle
// with a new skin value, or an array) -> no fallback to backup, roster empty.
const good = { alice: { ...newSave('Alice', 'beige'), stage: 14, coins: 320 } };
await AsyncStorage.setItem(B, JSON.stringify(good));
await AsyncStorage.setItem(P, JSON.stringify({ alice: { ...good.alice, skin: 'pale' } }));
const m1 = await loadSaves();
log('S1 loadSaves with future-shaped primary', Object.keys(m1));
// The game then writes any save change (e.g. a new character) -> backup overwritten with the unreadable primary
await writeSaves({ ...m1, bob: newSave('Bob', 'beige') });
log('S1 backup after next write still has alice?', Object.keys(parseSaves(await AsyncStorage.getItem(B)) ?? {}));
log('S1 primary after next write', Object.keys(parseSaves(await AsyncStorage.getItem(P)) ?? {}));

// S2: unknown (future) fields are dropped on parse and therefore on the next rewrite.
const future = { carol: { ...newSave('Carol', 'brown'), stage: 5, achievements: ['a', 'b'], coins: 10 } };
const parsed = parseSaves(JSON.stringify(future))!;
log('S2 unknown field survives parse?', 'achievements' in (parsed.carol as object));

// S3: truncated primary -> backup used (good); next write copies the corrupt primary over the backup.
await AsyncStorage.setItem(B, JSON.stringify(good));
await AsyncStorage.setItem(P, '{"alice":{"name":"Alice","sk');
const m3 = await loadSaves();
log('S3 recovered from backup', Object.keys(m3));
await writeSaves(m3);
log('S3 backup after write (raw head)', (await AsyncStorage.getItem(B))!.slice(0, 30));

// S4: name key collision with Object.prototype
const empty: Record<string, unknown> = {};
log('S4 "Constructor" reported as taken', !!empty['constructor']);

// S5: economy - Daily replay pays every time (no participation bonus after first), Endless rate
let s = newSave('Dan', 'beige');
let total = 0;
for (let i = 0; i < 5; i++) { const r = applyRunResult(s, { kind: 'daily', runId: 'r' + i, distanceM: 400, day: '2026-10-02' }); s = r.save; total += r.earned; }
let e = newSave('Eve', 'beige'); let te = 0;
for (let i = 0; i < 5; i++) { const r = applyRunResult(e, { kind: 'endless', runId: 'r' + i, distanceM: 400 }); e = r.save; te += r.earned; }
log('S5 five daily replays at 400 m vs five endless runs at 400 m', { daily: total, endless: te });
// S6: lastRewardedRun is single-slot: only a repeat of the immediately-previous run id is blocked
let f = newSave('Fay', 'beige'); let tf = 0;
for (const id of ['A', 'B', 'A']) { const r = applyRunResult(f, { kind: 'endless', runId: id, distanceM: 250 }); f = r.save; tf += r.earned; }
log('S6 run ids A,B,A at 250 m pay', tf);
// settings corruption
await AsyncStorage.setItem('endless-escaspe:settings:v1', '{bad');
await saveSettings({ masterVolume: 0.2 });
log('S7 settings after corrupt + patch', await loadSettings());
