// Daily Run: everyone playing on the same UTC day, under the same
// rules version, gets the same generated run.
//
// Bump DAILY_RULES_VERSION whenever a change would make the same seed
// produce a different layout (generation, spawn tables, difficulty
// curve). Players on different game versions then get different
// dailies instead of "the same" daily that silently differs.
export const DAILY_RULES_VERSION = 1;

// UTC calendar day as YYYY-MM-DD.
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// FNV-1a 32-bit hash: stable across platforms / JS engines.
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function dailySeed(dayKey: string, rulesVersion: number = DAILY_RULES_VERSION): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error(`bad day key: ${dayKey}`);
  // Never 0 (mulberry32 handles it, but keep seeds recognisable).
  return fnv1a(`endless-escape:daily:${dayKey}:rules-v${rulesVersion}`) || 1;
}

// RUN AGAIN on a Daily result (review A-12): the same yard again while
// it is still that UTC day; after midnight, today's Daily instead of
// replaying (and recording as "today") yesterday's.
export function dailyRunAgainDay(playedDay: string | null, now: Date): { sameDay: boolean; day: string } {
  const today = utcDayKey(now);
  return { sameDay: playedDay === today, day: today };
}
