import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BEST_STARS = 'endless-escaspe:bestStars:v1';
const KEY_SETTINGS = 'endless-escaspe:settings:v1';

// Best stars per stage. Persisted to AsyncStorage so the player
// keeps their high scores across app restarts. Loading is async;
// on first boot it returns an empty map.

export type BestStars = Record<number, number>;

export async function loadBestStars(): Promise<BestStars> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BEST_STARS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as BestStars;
  } catch {
    // Corrupt / missing - treat as empty.
  }
  return {};
}

export async function saveBestStars(b: BestStars): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_BEST_STARS, JSON.stringify(b));
  } catch {
    // Storage failures are non-fatal; the in-memory copy still works
    // for the current session.
  }
}

// User settings persisted alongside hi-scores. Currently the only
// fields are masterVolume (0..1) and weatherEnabled (boolean).

export type Settings = {
  masterVolume: number;
  weatherEnabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  weatherEnabled: true,
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
        weatherEnabled:
          typeof parsed.weatherEnabled === 'boolean'
            ? parsed.weatherEnabled
            : DEFAULT_SETTINGS.weatherEnabled,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    // ignore
  }
}
