import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BEST_STARS = 'endless-escaspe:bestStars:v1';

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
