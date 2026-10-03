// Save-data hardening (review A-3, A-4, A-7, A-10): nothing on disk is
// dropped because this build doesn't understand it, a bad primary
// never replaces a good backup, name lookups are own-property only,
// the boss perk is persisted, and a build rolled back to 370a624 can
// still read what this build writes.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSaves,
  writeSaves,
  parseSaves,
  parseSavesFull,
  newSave,
  getSave,
  hasOwn,
  isSaveKeyTaken,
  saveKeyFromName,
  getSavesLoadReport,
  getLastSavesWriteError,
  __resetSavesStateForTests,
  SAVES_META_KEY,
  SAVES_SCHEMA_VERSION,
  type Save,
  type SavesMap,
  type PlayerSkin,
} from '../src/util/storage';
import { getEntries } from '../src/util/debug';
import { campaignReward } from '../src/util/economy';
import { FREE_OUTFITS, isOutfitId, type OutfitId } from '../src/util/outfits';

const P = 'endless-escaspe:saves:v1';
const B = 'endless-escaspe:saves:v1.bak';
const Q = 'endless-escaspe:saves:v1.unreadable';

type StubStorage = {
  __reset(): void;
  __setFailRule(fn: ((op: string, key: string) => boolean) | null): void;
};
const stub = AsyncStorage as unknown as StubStorage;
const get = (k: string) => AsyncStorage.getItem(k);
const put = (k: string, v: unknown) => AsyncStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
const disk = async (k: string) => JSON.parse((await get(k)) ?? 'null');

beforeEach(() => {
  stub.__reset();
  __resetSavesStateForTests();
});

const alice = (): Save => ({ ...newSave('Alice', 'beige'), stage: 14, coins: 320, updatedAt: 1 });
const bob = (): Save => ({ ...newSave('Bob', 'brown'), stage: 3, coins: 7, updatedAt: 2 });

// ---- 370a624 parser, copied verbatim as a fixture (types renamed) ----
type OldSave = Omit<Save, 'perkStages'>;
type OldSavesMap = Record<string, OldSave>;
function cleanStringList(v: unknown, max: number = 64): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= 40 && !out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

const nonNegInt = (v: unknown, fallback: number = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;

// Economy fields with migration defaults. A save written before coins
// existed (no `coins` field) is migrated once: its already-earned
// campaign stars are converted into a starting balance at the normal
// rates and recorded as paid in coinStars, so they can't be paid again
// by replaying those stages; it also gets the free outfits, equipped
// to match its old skin. Once `coins` exists the save is read as-is,
// so re-parsing a migrated save never repeats the conversion.
function parseEconomy(
  v: Record<string, unknown>,
  skin: PlayerSkin,
  bestStars: Record<number, number>,
): Pick<OldSave, 'coins' | 'coinStars' | 'lastRewardedRun' | 'outfits' | 'outfit' | 'endlessBest' | 'daily'> {
  const migrated = typeof v.coins === 'number';
  let coins = nonNegInt(v.coins);
  let coinStars: Record<number, number> = {};
  if (migrated) {
    const raw = v.coinStars;
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw as Record<string, unknown>)) {
        const n = Number(k);
        const sv = (raw as Record<string, unknown>)[k];
        if (Number.isFinite(n) && typeof sv === 'number') coinStars[n] = Math.max(0, Math.min(3, sv | 0));
      }
    }
  } else {
    // One-time conversion of pre-economy progress.
    coinStars = { ...bestStars };
    for (const k of Object.keys(bestStars)) coins += campaignReward(bestStars[Number(k)], 0);
  }
  const owned = cleanStringList(v.outfits).filter(isOutfitId) as OutfitId[];
  for (const f of FREE_OUTFITS) if (!owned.includes(f)) owned.unshift(f);
  const equipped = isOutfitId(v.outfit) && owned.includes(v.outfit) ? v.outfit : skin === 'brown' ? 'grey' : 'classic';
  const dailyRaw = v.daily as { day?: unknown; best?: unknown } | null | undefined;
  const daily =
    dailyRaw && typeof dailyRaw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dailyRaw.day)
      ? { day: dailyRaw.day, best: nonNegInt(dailyRaw.best) }
      : null;
  return {
    coins: Math.min(999_999, coins),
    coinStars,
    lastRewardedRun: typeof v.lastRewardedRun === 'string' ? v.lastRewardedRun : null,
    outfits: owned,
    outfit: equipped,
    endlessBest: nonNegInt(v.endlessBest),
    daily,
  };
}

function oldParseSaves(raw: string | null): OldSavesMap | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const out: OldSavesMap = {};
  for (const k of Object.keys(parsed)) {
    const v = (parsed as Record<string, unknown>)[k] as Partial<OldSave> | null;
    if (
      v &&
      typeof v.name === 'string' &&
      (v.skin === 'beige' || v.skin === 'brown') &&
      typeof v.stage === 'number'
    ) {
      const cleanedStars: Record<number, number> = {};
      const rawStars = (v as { bestStars?: unknown }).bestStars;
      if (rawStars && typeof rawStars === 'object') {
        for (const sk of Object.keys(rawStars as Record<string, unknown>)) {
          const sv = (rawStars as Record<string, unknown>)[sk];
          const n = Number(sk);
          if (Number.isFinite(n) && typeof sv === 'number') {
            cleanedStars[n] = Math.max(0, Math.min(3, sv | 0));
          }
        }
      }
      out[saveKeyFromName(v.name)] = {
        name: v.name,
        skin: v.skin,
        stage: Math.max(1, v.stage | 0),
        bestStars: cleanedStars,
        updatedAt:
          typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
        tipsSeen: cleanStringList((v as { tipsSeen?: unknown }).tipsSeen),
        ...parseEconomy(v as Record<string, unknown>, v.skin, cleanedStars),
      };
    }
  }
  return out;
}
// ---- end of 370a624 fixture ----

// What a 370a624 build does on boot / on its next save write.
async function oldLoadSaves(): Promise<OldSavesMap> {
  const p = oldParseSaves(await get(P));
  if (p) return p;
  return oldParseSaves(await get(B)) ?? {};
}
async function oldWriteSaves(saves: OldSavesMap): Promise<void> {
  const existing = await get(P);
  if (existing != null) await put(B, existing);
  await put(P, JSON.stringify(saves));
}

test('A-4: an entry with an unknown skin survives a load / write cycle verbatim', async () => {
  const future = { ...alice(), skin: 'pale', hat: { id: 'tophat' } };
  await put(P, { alice: future, bob: bob() });
  const m = await loadSaves();
  assert.deepEqual(Object.keys(m), ['bob']);
  assert.equal(getSavesLoadReport().unreadableKept, 1);
  // The game writes the in-memory (playable) map, plus a new character.
  await writeSaves({ ...m, carl: newSave('Carl', 'beige') });
  const onDisk = await disk(P);
  assert.deepEqual(onDisk.alice, future);
  assert.deepEqual(Object.keys(onDisk).sort(), [SAVES_META_KEY, 'alice', 'bob', 'carl'].sort());
  // And again after a reload (state rebuilt from disk only).
  __resetSavesStateForTests();
  const m2 = await loadSaves();
  await writeSaves(m2);
  assert.deepEqual((await disk(P)).alice, future);
});

test('A-4: unknown fields on a recognised save survive parse and write', async () => {
  await put(P, { carol: { ...newSave('Carol', 'brown'), stage: 5, achievements: ['a', 'b'], outfits: ['classic', 'grey', 'neon'], outfit: 'neon' } });
  const m = await loadSaves();
  const c = getSave(m, 'carol')!;
  assert.deepEqual((c as Save & { achievements: string[] }).achievements, ['a', 'b']);
  // This build only offers outfits it knows, and shows a fallback.
  assert.ok(!(c.outfits as string[]).includes('neon'));
  assert.equal(c.outfit, 'grey');
  // A normal game update (economy spread) still writes the unknowns back.
  await writeSaves({ ...m, carol: { ...c, coins: c.coins + 10 } });
  const d = (await disk(P)).carol;
  assert.deepEqual(d.achievements, ['a', 'b']);
  assert.ok(d.outfits.includes('neon'));
  assert.equal(d.outfit, 'neon');
  assert.equal(d.coins, c.coins + 10);
  // Equipping a known outfit in this build is a real choice and wins.
  await writeSaves({ ...m, carol: { ...c, outfit: 'classic' } });
  assert.equal((await disk(P)).carol.outfit, 'classic');
});

test('A-4: truncated primary -> backup is used and is never overwritten by the corrupt primary', async () => {
  const good = JSON.stringify({ alice: alice() });
  await put(B, good);
  await put(P, '{"alice":{"name":"Alice","sk');
  const m = await loadSaves();
  assert.deepEqual(Object.keys(m), ['alice']);
  assert.equal(m.alice.stage, 14);
  assert.equal(getSavesLoadReport().recovered, true);
  await writeSaves(m);
  assert.equal(await get(B), good, 'backup untouched');
  assert.equal(await get(Q), '{"alice":{"name":"Alice","sk', 'corrupt primary parked, not destroyed');
  assert.equal((await disk(P)).alice.stage, 14);
  // Next write: the primary is healthy again, so it now refreshes the backup.
  await writeSaves({ ...m, bob: bob() });
  assert.deepEqual(Object.keys(parseSaves(await get(B))!), ['alice']);
  assert.ok(getEntries().some((e) => e.msg.includes('[storage] saves: recovered from backup: alice')));
});

test('A-4: unreadable primaries (array, non-object, failing read) never replace the backup', async () => {
  for (const bad of ['[]', '42', '"x"', 'null']) {
    stub.__reset();
    __resetSavesStateForTests();
    const good = JSON.stringify({ alice: alice() });
    await put(B, good);
    await put(P, bad);
    const m = await loadSaves();
    assert.deepEqual(Object.keys(m), ['alice'], bad);
    await writeSaves({ ...m, bob: bob() });
    assert.equal(await get(B), good, bad);
  }
  // A read error on the primary is logged and falls back the same way.
  stub.__reset();
  __resetSavesStateForTests();
  await put(B, { alice: alice() });
  await put(P, { bob: bob() });
  stub.__setFailRule((op, k) => op === 'getItem' && k === P);
  const m = await loadSaves();
  assert.deepEqual(Object.keys(m), ['alice']);
  assert.ok(getEntries().some((e) => e.msg.includes('[storage] saves: reading primary failed')));
});

test("A-4: '{}' and zero-valid primaries fall back to the backup; a deliberate empty roster does not", async () => {
  await put(B, { alice: alice() });
  await put(P, '{}');
  assert.deepEqual(Object.keys(await loadSaves()), ['alice']);

  stub.__reset();
  __resetSavesStateForTests();
  await put(B, { alice: alice() });
  await put(P, { alice: null, zed: 5 });
  const m = await loadSaves();
  // Junk under a backup save's name does not hide that save...
  assert.equal(getSave(m, 'alice')?.stage, 14);
  await writeSaves(m);
  const d = await disk(P);
  // ...the other junk entry is still kept verbatim.
  assert.equal(d.zed, 5);
  assert.equal(d.alice.stage, 14);

  // Every save deleted in this build: meta-only file = really empty.
  stub.__reset();
  __resetSavesStateForTests();
  await put(P, { alice: alice() });
  await loadSaves();
  await writeSaves({});
  await writeSaves({});
  __resetSavesStateForTests();
  assert.deepEqual(Object.keys(await loadSaves()), []);
});

test('A-4: a save-like newer entry in the primary is kept over an older backup copy', async () => {
  const newer = { ...alice(), skin: 'pale', stage: 30 };
  await put(B, { alice: alice(), bob: bob() });
  await put(P, { alice: newer });
  const m = await loadSaves();
  assert.deepEqual(Object.keys(m), ['bob']);
  assert.equal(isSaveKeyTaken(m, 'alice'), true, 'name stays reserved');
  await writeSaves(m);
  const d = await disk(P);
  assert.deepEqual(d.alice, newer);
  assert.equal(d.bob.stage, 3);
});

test('A-4: duplicate raw entries for one name are both kept', async () => {
  await put(P, { alice: alice(), ALICE: { ...alice(), name: 'alice', stage: 2 } });
  const m = await loadSaves();
  assert.equal(m.alice.stage, 14);
  await writeSaves(m);
  const d = await disk(P);
  assert.equal(d.alice.stage, 14);
  assert.equal(d.ALICE.stage, 2);
});

test('A-4: schemaVersion meta is written, and a newer version is preserved, not downgraded', async () => {
  await put(P, { alice: alice() });
  await writeSaves(await loadSaves());
  assert.deepEqual((await disk(P))[SAVES_META_KEY], { schemaVersion: SAVES_SCHEMA_VERSION, writtenBy: SAVES_SCHEMA_VERSION });

  stub.__reset();
  __resetSavesStateForTests();
  await put(P, { [SAVES_META_KEY]: { schemaVersion: 9, flags: ['x'] }, alice: alice() });
  const m = await loadSaves();
  assert.equal(getSavesLoadReport().newerSchema, true);
  await writeSaves(m);
  assert.deepEqual((await disk(P))[SAVES_META_KEY], { schemaVersion: 9, flags: ['x'], writtenBy: SAVES_SCHEMA_VERSION });
});

test('A-4: a write issued before the first load keeps the saves already on disk', async () => {
  await put(P, { alice: alice() });
  // e.g. a character created before App's loadSaves resolved
  const w = writeSaves({ bob: bob() });
  assert.equal(await w, true);
  assert.deepEqual(Object.keys(await disk(P)).sort(), [SAVES_META_KEY, 'alice', 'bob'].sort());
});

test('A-7: "Constructor" and "__proto__" are ordinary names', async () => {
  const empty: SavesMap = {};
  assert.equal(getSave(empty, 'constructor'), undefined);
  assert.equal(isSaveKeyTaken(empty, 'constructor'), false);
  assert.equal(isSaveKeyTaken(empty, 'tostring'), false);
  assert.equal(hasOwn({}, '__proto__'), false);

  const raw = `{"constructor":${JSON.stringify(newSave('Constructor', 'beige'))},"__proto__":${JSON.stringify({ ...newSave('__proto__', 'brown'), stage: 4 })}}`;
  const parsed = parseSaves(raw)!;
  assert.deepEqual(Object.keys(parsed).sort(), ['__proto__', 'constructor']);
  assert.equal(getSave(parsed, '__proto__')!.stage, 4);
  assert.equal(Object.getPrototypeOf(parsed), null);
  await put(P, raw);
  const m = await loadSaves();
  await writeSaves(m);
  const back = parseSaves(await get(P))!;
  assert.equal(getSave(back, '__proto__')!.stage, 4);
  assert.equal(getSave(back, 'constructor')!.name, 'Constructor');
  assert.equal(saveKeyFromName(' Constructor '), 'constructor');
});

test('A-7: store save-map plumbing is own-property safe', async () => {
  const { useStore } = await import('../src/state/store');
  const st = useStore.getState();
  assert.equal(getSave(st.saves, 'constructor'), undefined);
  st.removeSave('constructor'); // no-op, no throw
  st.upsertSave(newSave('Constructor', 'beige'));
  assert.equal(getSave(useStore.getState().saves, 'constructor')!.name, 'Constructor');
  useStore.getState().removeSave('constructor');
  assert.equal(hasOwn(useStore.getState().saves, 'constructor'), false);
});

test('A-3: the boss perk is persisted per save and defaults to 0 for older saves', async () => {
  const legacy = { ...alice() } as Partial<Save>;
  delete legacy.perkStages;
  assert.equal(parseSaves(JSON.stringify({ alice: legacy }))!.alice.perkStages, 0);
  const withPerk = parseSaves(JSON.stringify({ alice: { ...alice(), perkStages: 9 } }))!;
  assert.equal(withPerk.alice.perkStages, 9);
  assert.equal(parseSaves(JSON.stringify(withPerk))!.alice.perkStages, 9, 'round trip');
  assert.equal(parseSaves(JSON.stringify({ a: { ...alice(), perkStages: -3 } }))!.alice.perkStages, 0);
  assert.equal(parseSaves(JSON.stringify({ a: { ...alice(), perkStages: 'x' } }))!.alice.perkStages, 0);
  assert.equal(newSave('Z', 'beige').perkStages, 0);

  await put(P, { alice: { ...alice(), perkStages: 9 } });
  const m = await loadSaves();
  await writeSaves(m);
  assert.equal((await disk(P)).alice.perkStages, 9);

  const { useStore } = await import('../src/state/store');
  useStore.getState().startRun({ perkStages: m.alice.perkStages });
  assert.equal(useStore.getState().perkRemainingStages, 9);
  useStore.getState().startRun();
  assert.equal(useStore.getState().perkRemainingStages, 0);
  // Wired straight to an onPress: an event object is not a perk.
  useStore.getState().startRun({ nativeEvent: {} } as never);
  assert.equal(useStore.getState().perkRemainingStages, 0);
});

test('A-10: storage failures are logged and reported, never thrown', async () => {
  await put(P, { alice: alice() });
  const m = await loadSaves();
  stub.__setFailRule((op, k) => op === 'setItem' && k === P);
  assert.equal(await writeSaves(m), false);
  assert.match(getLastSavesWriteError() ?? '', /setItem failed/);
  assert.ok(getEntries().some((e) => e.level === 'warn' && e.msg.startsWith('[storage] saves: write failed')));
  stub.__setFailRule(null);
  assert.equal(await writeSaves(m), true);
  assert.equal(getLastSavesWriteError(), null);
  // Logged lines carry save names at most, never save contents.
  for (const e of getEntries()) assert.ok(!e.msg.includes('"coins"'), e.msg);
});

test('compat: a 370a624 build reads what this build writes without losing what it understood', async () => {
  const future = { ...alice(), name: 'Dora', skin: 'pale' };
  await put(P, { alice: { ...alice(), perkStages: 4 }, bob: bob(), dora: future });
  await writeSaves({ ...(await loadSaves()), carl: newSave('Carl', 'beige') });
  const written = await get(P);
  assert.ok(JSON.parse(written!)[SAVES_META_KEY], 'meta entry present');

  // Rolled-back build: parses, skips meta / unknown entries, keeps the rest.
  const old = oldParseSaves(written)!;
  assert.deepEqual(Object.keys(old).sort(), ['alice', 'bob', 'carl']);
  const expectNew = parseSaves(written)!;
  for (const k of ['alice', 'bob', 'carl']) {
    const { perkStages: _p, ...rest } = expectNew[k];
    void _p;
    assert.deepEqual(old[k], rest, k);
  }
  // Its next write drops what it can't read (that code is already on
  // phones) - but our file goes to the backup first, so nothing is gone.
  await oldWriteSaves({ ...(await oldLoadSaves()) });
  const bak = parseSavesFull(await get(B))!;
  assert.deepEqual(bak.passthrough.dora, future);
  assert.equal(bak.saves.alice.perkStages, 4);

  // Updating again: this build reads the old build's file normally.
  __resetSavesStateForTests();
  const again = await loadSaves();
  assert.deepEqual(Object.keys(again).sort(), ['alice', 'bob', 'carl']);
  assert.equal(again.alice.stage, 14);
});

test('compat: saves written by 370a624 load unchanged (plus defaults) in this build', async () => {
  const legacy = { alice: { ...alice() }, bob: bob() } as Record<string, Partial<Save>>;
  delete legacy.alice.perkStages;
  delete legacy.bob.perkStages;
  const raw = JSON.stringify(oldParseSaves(JSON.stringify(legacy)));
  const now = parseSaves(raw)!;
  const was = oldParseSaves(raw)!;
  for (const k of ['alice', 'bob']) assert.deepEqual(now[k], { ...was[k], perkStages: 0 });
});
