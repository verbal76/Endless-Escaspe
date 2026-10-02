import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys keep the original (misspelled) slug on purpose:
// renaming them would orphan every existing save.
import { FREE_OUTFITS, isOutfitId, type OutfitId } from './outfits';
import { campaignReward } from './economy';
import { logDebug } from './debug';

const KEY_SETTINGS = 'endless-escaspe:settings:v1';
const KEY_SAVES = 'endless-escaspe:saves:v1';
const KEY_SAVES_BACKUP = 'endless-escaspe:saves:v1.bak';
// Last primary that could not be read, parked here (instead of being
// silently overwritten) the first time the game writes over it. Never
// read by the game; it exists so a bug report / support can recover it.
const KEY_SAVES_QUARANTINE = 'endless-escaspe:saves:v1.unreadable';

// Storage failures are never fatal for the player, but they must leave
// a trace in the bug-report log. Only messages and save *names* (the
// map keys) are logged, never save contents.
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function warnStorage(msg: string, e?: unknown): void {
  if (e === undefined) logDebug('warn', `[storage] ${msg}`);
  else logDebug('warn', `[storage] ${msg}:`, errText(e));
}

// Own-property test for maps keyed by user-typed text. A plain `{}`
// answers `map['constructor']` from Object.prototype, so a bare
// `map[key]` / `key in map` check says the name "Constructor" is taken.
// (`Object.hasOwn` is avoided on purpose: older Hermes builds lack it.)
export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Serial write queue. Settings and saves writes are routed through
// `enqueueWrite(key, fn)` so a load-modify-write sequence can never
// be split by an interleaved write to the same key. Each key gets
// its own promise chain so unrelated keys still write in parallel.
const writeChains: Record<string, Promise<unknown>> = Object.create(null);
function enqueueWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains[key] ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  writeChains[key] = next.catch(() => undefined);
  return next;
}

// User settings persisted globally. Volume + weather are not tied to
// any specific character; the active prisoner skin and the per-stage
// star high scores live on the per-character save file (see Save
// below) and are no longer carried here.

export type Settings = {
  masterVolume: number;
  // Music volume slider in the pause menu. Independent of master so
  // the player can mute the soundtrack without losing siren / SFX.
  musicVolume: number;
  weatherEnabled: boolean;
  // True once the player has seen (or skipped) the intro tutorial,
  // so we don't replay it every cold launch. The "How to play"
  // entry on the start screen still re-shows it on demand.
  tutorialSeen: boolean;
  // Test / dev gate. Flipped to true once the player enters the
  // unlock code in the settings panel; reveals the boss-arena
  // toggle below.
  bossModeUnlocked: boolean;
  // When true, the next scene rebuild produces a boss-arena
  // variant (smaller enclosed arena, survive-the-timer goal) in
  // place of the standard linear segment. Persisted so the toggle
  // survives a relaunch.
  bossModeEnabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  weatherEnabled: true,
  tutorialSeen: false,
  bossModeUnlocked: false,
  bossModeEnabled: false,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        masterVolume:
          typeof parsed.masterVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.masterVolume))
            : DEFAULT_SETTINGS.masterVolume,
        musicVolume:
          typeof parsed.musicVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.musicVolume))
            : DEFAULT_SETTINGS.musicVolume,
        weatherEnabled:
          typeof parsed.weatherEnabled === 'boolean'
            ? parsed.weatherEnabled
            : DEFAULT_SETTINGS.weatherEnabled,
        tutorialSeen:
          typeof parsed.tutorialSeen === 'boolean'
            ? parsed.tutorialSeen
            : DEFAULT_SETTINGS.tutorialSeen,
        bossModeUnlocked:
          typeof parsed.bossModeUnlocked === 'boolean'
            ? parsed.bossModeUnlocked
            : DEFAULT_SETTINGS.bossModeUnlocked,
        bossModeEnabled:
          typeof parsed.bossModeEnabled === 'boolean'
            ? parsed.bossModeEnabled
            : DEFAULT_SETTINGS.bossModeEnabled,
      };
    }
    warnStorage('settings: stored value is not an object, using defaults');
  } catch (e) {
    warnStorage('settings: load failed, using defaults', e);
  }
  return DEFAULT_SETTINGS;
}

// Persist a settings patch. Reads the existing file first so callers
// only need to specify the fields they're changing - SettingsScreen
// doesn't have to know about flags it never edits (e.g. tutorialSeen).
//
// Routed through enqueueWrite so simultaneous saveSettings calls
// (e.g. tutorial dismiss writing tutorialSeen, settings panel writing
// masterVolume) can't interleave their read-modify-write phases.
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  return enqueueWrite(KEY_SETTINGS, async () => {
    try {
      const existing = await loadSettings();
      const next: Settings = { ...existing, ...patch };
      await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(next));
    } catch (e) {
      warnStorage('settings: write failed', e);
    }
  });
}

// Per-character save file. Created when the player picks a prisoner
// figure and types a name on the start screen. The display name is
// the identity; saves are keyed in storage by the trimmed lowercase
// form of that name so case/whitespace differences don't create
// duplicates. `stage` advances on segment win and is mirrored back
// here so "Continue" picks up where the run left off.

export type PlayerSkin = 'beige' | 'brown';

export type Save = {
  name: string;
  skin: PlayerSkin;
  // Highest stage the player can resume into. Acts as a high-water
  // mark: replaying a lower stage doesn't roll this back.
  stage: number;
  // Best stars achieved per cleared stage. Stage keys are numeric; a
  // missing key means the stage hasn't been cleared with this
  // character yet.
  bestStars: Record<number, number>;
  updatedAt: number;
  // In-game tutorial prompts this character has already seen (ids
  // from util/stageTips). Absent in saves written before prompts
  // existed; parseSaves defaults it to [] so old saves load as
  // "nothing seen yet" without losing any other data.
  tipsSeen: string[];
  // ---- Economy / modes (added with coins + outfits). Every field is
  // defaulted by parseSaves so older saves migrate without loss. ----
  coins: number;
  // Stars already paid out in coins, per campaign stage.
  coinStars: Record<number, number>;
  // Run id of the last reward applied (idempotency guard).
  lastRewardedRun: string | null;
  outfits: OutfitId[];
  outfit: OutfitId;
  endlessBest: number;
  daily: { day: string; best: number } | null;
  // Boss perk ("+1 heart for the next N stages") still owed at this
  // save's resume point (`stage`), counted *before* that stage is
  // charged. 0 when none. Absent in older saves -> 0.
  perkStages: number;
};

export type SavesMap = Record<string, Save>;

// Look up a save by key without falling through to Object.prototype.
export function getSave(saves: SavesMap, key: string | null | undefined): Save | undefined {
  return key != null && hasOwn(saves, key) ? saves[key] : undefined;
}

// A brand-new character save with every field at its default.
export function newSave(name: string, skin: PlayerSkin): Save {
  return {
    name,
    skin,
    stage: 1,
    bestStars: {},
    updatedAt: Date.now(),
    tipsSeen: [],
    coins: 0,
    coinStars: {},
    lastRewardedRun: null,
    outfits: [...FREE_OUTFITS],
    outfit: skin === 'brown' ? 'grey' : 'classic',
    endlessBest: 0,
    daily: null,
    perkStages: 0,
  };
}

export function saveKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

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
): Pick<Save, 'coins' | 'coinStars' | 'lastRewardedRun' | 'outfits' | 'outfit' | 'endlessBest' | 'daily'> {
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

// ---------------------------------------------------------------------
// Saves file format and compatibility contract
// ---------------------------------------------------------------------
// The file is one JSON object: save key -> save entry, plus one meta
// entry under SAVES_META_KEY. Every build since the first one reads it
// by iterating Object.keys and accepting an entry only when it has a
// string `name`, a known `skin` and a numeric `stage`, so:
//
//  - The meta entry ({ schemaVersion, ... }, no `name`) is skipped by
//    every older parser, including the 370a624 one (tested). Its key
//    can't collide with a save: keys come from typed names, and the
//    name keyboard has letters only.
//  - Recognised entries are written in the same shape older builds
//    accept; new fields (e.g. perkStages) are extra keys they ignore.
//  - Anything this build can't validate (an unknown skin, a non-number
//    stage, a non-object) is NOT dropped: it is kept verbatim and
//    written back unchanged. Unknown fields on recognised entries and
//    unknown outfit ids are kept too. An older build that rewrites the
//    file still drops what it doesn't know (that code is already on
//    phones), but its write first copies our file into the backup.
//  - A file that carries a newer schemaVersion is still written (all
//    unknown data survives); the meta keeps the higher version and
//    records `writtenBy` so a newer build can tell an older bundle
//    touched it. Newer builds must keep defaulting every field per
//    entry instead of trusting schemaVersion alone.
export const SAVES_META_KEY = '~meta';
export const SAVES_SCHEMA_VERSION = 2;

export type SavesParse = {
  // Entries this build understands, keyed by saveKeyFromName(name).
  saves: SavesMap;
  // Entries it doesn't, verbatim, by their raw key.
  passthrough: Record<string, unknown>;
  // Raw meta entry (null when the file has none, i.e. written by a
  // build older than schema 2).
  meta: Record<string, unknown> | null;
  // Per save key: outfit ids this build doesn't know, and an equipped
  // outfit it doesn't know (plus the fallback shown instead).
  unknownOutfits: Record<string, string[]>;
  unknownEquipped: Record<string, { raw: string; fallback: OutfitId }>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Full parse. Returns null only when `raw` is missing or is not a JSON
// object at all (unreadable); otherwise every entry ends up in either
// `saves` or `passthrough`.
export function parseSavesFull(raw: string | null): SavesParse | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const out: SavesParse = {
    saves: Object.create(null),
    passthrough: Object.create(null),
    meta: null,
    unknownOutfits: Object.create(null),
    unknownEquipped: Object.create(null),
  };
  for (const k of Object.keys(parsed)) {
    const v = parsed[k];
    if (k === SAVES_META_KEY && isPlainObject(v) && typeof v.name !== 'string') {
      out.meta = v;
      continue;
    }
    const key = isPlainObject(v) && typeof v.name === 'string' ? saveKeyFromName(v.name) : null;
    if (
      key == null ||
      !isPlainObject(v) ||
      !(v.skin === 'beige' || v.skin === 'brown') ||
      typeof v.stage !== 'number' ||
      // Two raw entries naming the same character: keep the first as
      // the playable one and the other verbatim, rather than letting
      // one silently replace the other.
      hasOwn(out.saves, key)
    ) {
      out.passthrough[k] = v;
      continue;
    }
    const skin: PlayerSkin = v.skin;
    const cleanedStars: Record<number, number> = {};
    const rawStars = v.bestStars;
    if (rawStars && typeof rawStars === 'object') {
      for (const sk of Object.keys(rawStars as Record<string, unknown>)) {
        const sv = (rawStars as Record<string, unknown>)[sk];
        const n = Number(sk);
        if (Number.isFinite(n) && typeof sv === 'number') {
          cleanedStars[n] = Math.max(0, Math.min(3, sv | 0));
        }
      }
    }
    const econ = parseEconomy(v, skin, cleanedStars);
    // Unknown (newer) fields ride along: spread the raw entry first,
    // then overwrite every field this build validates.
    out.saves[key] = {
      ...(v as object),
      name: v.name as string,
      skin,
      stage: Math.max(1, (v.stage as number) | 0),
      bestStars: cleanedStars,
      updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
      tipsSeen: cleanStringList(v.tipsSeen),
      ...econ,
      perkStages: Math.min(1000, nonNegInt(v.perkStages)),
    } as Save;
    const extraOutfits = cleanStringList(v.outfits).filter((id) => !isOutfitId(id));
    if (extraOutfits.length) out.unknownOutfits[key] = extraOutfits;
    if (typeof v.outfit === 'string' && v.outfit.length > 0 && !isOutfitId(v.outfit)) {
      out.unknownEquipped[key] = { raw: v.outfit, fallback: econ.outfit };
    }
  }
  return out;
}

// The playable saves only (null = unreadable). Kept for existing
// callers and tests; the game itself goes through loadSaves.
export function parseSaves(raw: string | null): SavesMap | null {
  const p = parseSavesFull(raw);
  return p ? p.saves : null;
}

const countKeys = (o: object) => Object.keys(o).length;

// A primary is "healthy" (used as-is, and safe to snapshot into the
// backup) when it is readable and either holds at least one save this
// build can play, or is a deliberately empty roster written by a
// schema-2+ build (meta entry and nothing else). `{}`, `[]`, truncated
// JSON, or a file of only unreadable entries is not: the backup is
// consulted, and the file itself is parked rather than backed up.
function isHealthy(p: SavesParse | null): boolean {
  return !!p && (countKeys(p.saves) > 0 || (p.meta != null && countKeys(p.passthrough) === 0));
}

// ---- Module state for the loaded roster (one roster per app). ----
type Carry = Pick<SavesParse, 'passthrough' | 'meta' | 'unknownOutfits' | 'unknownEquipped'>;
const emptyCarry = (): Carry => ({
  passthrough: Object.create(null),
  meta: null,
  unknownOutfits: Object.create(null),
  unknownEquipped: Object.create(null),
});
let carry: Carry = emptyCarry();
let loadCompleted = false;
let loadInFlight: Promise<SavesMap> | null = null;

export type SavesLoadReport = {
  source: 'primary' | 'backup' | 'primary+backup' | 'none';
  // True when the backup had to be used (the player may have lost the
  // most recent change); show a one-off notice.
  recovered: boolean;
  // Entries kept verbatim because this build can't read them (e.g. a
  // character from a newer update).
  unreadableKept: number;
  // The file was written by a newer schema than this build knows.
  newerSchema: boolean;
};
let lastReport: SavesLoadReport = { source: 'none', recovered: false, unreadableKept: 0, newerSchema: false };
export function getSavesLoadReport(): SavesLoadReport {
  return lastReport;
}

let lastWriteError: string | null = null;
// Message of the most recent failed saves write (null after a success).
export function getLastSavesWriteError(): string | null {
  return lastWriteError;
}

// True when `key` is used by a save, including one this build can't
// read (kept verbatim). Use it for "name already taken" so creating a
// character never overwrites an unreadable one with the same name.
export function isSaveKeyTaken(saves: SavesMap, key: string): boolean {
  return hasOwn(saves, key) || hasOwn(carry.passthrough, key);
}

// Test hook: forget the loaded-roster state.
export function __resetSavesStateForTests(): void {
  carry = emptyCarry();
  loadCompleted = false;
  loadInFlight = null;
  lastReport = { source: 'none', recovered: false, unreadableKept: 0, newerSchema: false };
  lastWriteError = null;
}

function metaVersion(meta: Record<string, unknown> | null): number {
  return meta && typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 1;
}

async function readKey(key: string, label: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    warnStorage(`saves: reading ${label} failed`, e);
    return null;
  }
}

async function loadSavesInner(): Promise<SavesMap> {
  const primaryRaw = await readKey(KEY_SAVES, 'primary');
  const primary = parseSavesFull(primaryRaw);
  let result: SavesParse | null = null;
  let source: SavesLoadReport['source'] = 'none';

  if (primary && isHealthy(primary)) {
    result = primary;
    source = 'primary';
  } else {
    // Unreadable, missing, `{}`, or nothing playable: try the backup.
    // The backup is a copy of an earlier healthy primary.
    const backupRaw = await readKey(KEY_SAVES_BACKUP, 'backup');
    const backup = parseSavesFull(backupRaw);
    if (primaryRaw != null) {
      warnStorage(
        primary
          ? `saves: primary has no readable saves (${countKeys(primary.passthrough)} unreadable entries), trying backup`
          : 'saves: primary unreadable, trying backup',
      );
    }
    if (backup && primary) {
      // Readable primary with only unreadable entries: keep those
      // verbatim and add the backup's saves under the other names. A
      // primary entry that looks like a save (object with a name) is
      // probably newer data and wins; junk (null, numbers) does not.
      result = backup;
      for (const k of Object.keys(primary.passthrough)) {
        const v = primary.passthrough[k];
        const looksLikeSave = isPlainObject(v) && typeof v.name === 'string';
        if (hasOwn(result.saves, k)) {
          if (!looksLikeSave) continue;
          delete result.saves[k];
          delete result.unknownOutfits[k];
          delete result.unknownEquipped[k];
        }
        result.passthrough[k] = v;
      }
      if (primary.meta) result.meta = primary.meta;
      source = 'primary+backup';
    } else if (backup) {
      result = backup;
      source = 'backup';
    } else if (primary) {
      result = primary;
      source = 'primary';
    }
  }

  if (!result) {
    carry = emptyCarry();
    lastReport = { source: 'none', recovered: false, unreadableKept: 0, newerSchema: false };
    if (primaryRaw != null) warnStorage('saves: no readable primary or backup, starting with an empty roster');
    return Object.create(null);
  }
  const recovered = source !== 'primary' && countKeys(result.saves) > 0;
  const newerSchema = metaVersion(result.meta) > SAVES_SCHEMA_VERSION;
  carry = {
    passthrough: result.passthrough,
    meta: result.meta,
    unknownOutfits: result.unknownOutfits,
    unknownEquipped: result.unknownEquipped,
  };
  lastReport = { source, recovered, unreadableKept: countKeys(result.passthrough), newerSchema };
  if (recovered) {
    logDebug('warn', `[storage] saves: recovered from backup: ${Object.keys(result.saves).join(', ')}`);
  }
  if (lastReport.unreadableKept > 0) {
    warnStorage(`saves: keeping ${lastReport.unreadableKept} unreadable entries unchanged: ${Object.keys(result.passthrough).join(', ')}`);
  }
  if (newerSchema) {
    warnStorage(`saves: file has schema ${metaVersion(result.meta)}, this build knows ${SAVES_SCHEMA_VERSION}; unknown data is preserved`);
  }
  return result.saves;
}

// Load the roster. Never throws; worst case is an empty roster, and
// even then nothing unreadable on disk is overwritten without first
// being parked (see writeSaves).
export function loadSaves(): Promise<SavesMap> {
  const p = loadSavesInner()
    .catch((e) => {
      warnStorage('saves: load failed', e);
      return Object.create(null) as SavesMap;
    })
    .then((m) => {
      loadCompleted = true;
      if (loadInFlight === p) loadInFlight = null;
      return m;
    });
  loadInFlight = p;
  return p;
}

function serializeSave(key: string, s: Save): unknown {
  const extra = hasOwn(carry.unknownOutfits, key) ? carry.unknownOutfits[key] : null;
  const equipped = hasOwn(carry.unknownEquipped, key) ? carry.unknownEquipped[key] : null;
  if (!extra && !equipped) return s;
  const out: Record<string, unknown> = { ...s };
  if (extra) out.outfits = [...s.outfits, ...extra.filter((id) => !(s.outfits as string[]).includes(id))];
  // Still showing the fallback for an outfit this build doesn't know:
  // keep the original choice on disk for the build that does.
  if (equipped && s.outfit === equipped.fallback) out.outfit = equipped.raw;
  return out;
}

// Write the whole roster. Callers pass the full in-memory map (the
// saves this build can play); entries kept verbatim at load time are
// merged back in, the meta entry is refreshed, and the backup is
// refreshed only from a primary that was healthy. Resolves true on
// success, false on failure (also logged); never rejects.
export function writeSaves(saves: SavesMap): Promise<boolean> {
  // A write issued before the roster was ever loaded (e.g. a character
  // created in the first moments after launch) must not replace saves
  // the player hasn't even seen yet.
  const issuedBeforeLoad = !loadCompleted;
  return enqueueWrite(KEY_SAVES, async () => {
    try {
      let map: SavesMap = saves;
      if (issuedBeforeLoad) {
        const onDisk = await (loadInFlight ?? loadSaves());
        const merged: SavesMap = Object.create(null);
        for (const k of Object.keys(onDisk)) merged[k] = onDisk[k];
        for (const k of Object.keys(saves)) merged[k] = saves[k];
        if (countKeys(onDisk) > 0) {
          warnStorage(`saves: write issued before load finished; kept ${Object.keys(onDisk).filter((k) => !hasOwn(saves, k)).join(', ') || 'nothing extra'}`);
        }
        map = merged;
      }

      const out: Record<string, unknown> = Object.create(null);
      const storedVersion = metaVersion(carry.meta);
      out[SAVES_META_KEY] = {
        ...(carry.meta ?? {}),
        schemaVersion: Math.max(storedVersion, SAVES_SCHEMA_VERSION),
        writtenBy: SAVES_SCHEMA_VERSION,
      };
      for (const k of Object.keys(carry.passthrough)) {
        if (hasOwn(map, k)) {
          // The player made a new playable save under a name held by
          // an unreadable entry (isSaveKeyTaken should prevent this).
          // Their new save wins; the old entry stays in the backup.
          warnStorage(`saves: playable save "${k}" replaces an unreadable entry with the same key`);
          delete carry.passthrough[k];
          continue;
        }
        out[k] = carry.passthrough[k];
      }
      for (const k of Object.keys(map)) out[k] = serializeSave(k, map[k]);
      // Forget per-save extras of saves that were deleted, so a new
      // character with the same name doesn't inherit them.
      for (const k of Object.keys(carry.unknownOutfits)) if (!hasOwn(map, k)) delete carry.unknownOutfits[k];
      for (const k of Object.keys(carry.unknownEquipped)) if (!hasOwn(map, k)) delete carry.unknownEquipped[k];

      // Snapshot the current primary into the backup before
      // overwriting it - but only a healthy one. An unreadable primary
      // never replaces a good backup; it is parked instead.
      const existing = await readKey(KEY_SAVES, 'primary before write');
      if (existing != null) {
        if (isHealthy(parseSavesFull(existing))) {
          try {
            await AsyncStorage.setItem(KEY_SAVES_BACKUP, existing);
          } catch (e) {
            warnStorage('saves: backup refresh failed', e);
          }
        } else {
          warnStorage('saves: primary not healthy; backup left untouched, old primary parked');
          try {
            await AsyncStorage.setItem(KEY_SAVES_QUARANTINE, existing);
          } catch (e) {
            warnStorage('saves: parking unreadable primary failed', e);
          }
        }
      }
      await AsyncStorage.setItem(KEY_SAVES, JSON.stringify(out));
      lastWriteError = null;
      return true;
    } catch (e) {
      lastWriteError = errText(e);
      warnStorage('saves: write failed', e);
      return false;
    }
  });
}
