import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys keep the original (misspelled) slug on purpose:
// renaming them would orphan every existing save.
import { FREE_OUTFITS, isOutfitId, type OutfitId } from './outfits';
import { campaignReward } from './economy';

const KEY_SETTINGS = 'endless-escaspe:settings:v1';
const KEY_SAVES = 'endless-escaspe:saves:v1';
const KEY_SAVES_BACKUP = 'endless-escaspe:saves:v1.bak';

// Serial write queue. Settings and saves writes are routed through
// `enqueueWrite(key, fn)` so a load-modify-write sequence can never
// be split by an interleaved write to the same key. Each key gets
// its own promise chain so unrelated keys still write in parallel.
const writeChains: Record<string, Promise<unknown>> = {};
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
  } catch {
    // ignore
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
    } catch {
      // ignore
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
};

export type SavesMap = Record<string, Save>;

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

export function parseSaves(raw: string | null): SavesMap | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const out: SavesMap = {};
  for (const k of Object.keys(parsed)) {
    const v = (parsed as Record<string, unknown>)[k] as Partial<Save> | null;
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

export async function loadSaves(): Promise<SavesMap> {
  // Try the primary slot first, then fall back to the backup if the
  // primary parse fails or returns nothing usable. The backup is
  // written *before* every overwrite of the primary, so the worst
  // case for a user is "you lose at most the last successful run's
  // record" rather than the entire roster.
  try {
    const raw = await AsyncStorage.getItem(KEY_SAVES);
    const parsed = parseSaves(raw);
    if (parsed) return parsed;
  } catch {
    // fall through to backup
  }
  try {
    const backup = await AsyncStorage.getItem(KEY_SAVES_BACKUP);
    const parsed = parseSaves(backup);
    if (parsed) return parsed;
  } catch {
    // ignore
  }
  return {};
}

export async function writeSaves(saves: SavesMap): Promise<void> {
  return enqueueWrite(KEY_SAVES, async () => {
    try {
      // Snapshot the current primary into the backup slot before
      // we overwrite. If the new write itself errors, the primary
      // is unchanged; if the device crashes mid-write, the backup
      // still has yesterday's roster.
      const existing = await AsyncStorage.getItem(KEY_SAVES);
      if (existing != null) {
        try {
          await AsyncStorage.setItem(KEY_SAVES_BACKUP, existing);
        } catch {
          // best-effort
        }
      }
      await AsyncStorage.setItem(KEY_SAVES, JSON.stringify(saves));
    } catch {
      // ignore
    }
  });
}
