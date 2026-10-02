import type { Save } from './storage';
import { FREE_OUTFITS, outfitById, type OutfitId } from './outfits';

// Coin economy. Integers only; every reward is recorded so the same
// achievement can never pay twice:
//   - campaign stars pay per stage only for stars above what that
//     stage has already paid (Save.coinStars ledger);
//   - a run's reward is applied at most once (Save.lastRewardedRun).
// Coins buy cosmetic outfits only.

export const COINS_PER_STAR = 10;
export const FIRST_CLEAR_BONUS = 5;
export const ENDLESS_METRES_PER_COIN = 25;
export const DAILY_METRES_PER_COIN = 20;
export const DAILY_PARTICIPATION_BONUS = 10;
export const MAX_COINS = 999_999;

const clampCoins = (n: number) => Math.max(0, Math.min(MAX_COINS, Math.floor(n)));

// Own-property read for the per-stage ledgers (never answered by
// Object.prototype). Local copy: importing storage.ts here would make
// an import cycle (storage.ts imports campaignReward).
const ownNum = (m: Record<number, number>, k: number): number =>
  Object.prototype.hasOwnProperty.call(m, k) && typeof m[k] === 'number' ? m[k] : 0;

export function campaignReward(stars: number, alreadyPaidStars: number): number {
  const s = Math.max(0, Math.min(3, Math.floor(stars)));
  const paid = Math.max(0, Math.min(3, Math.floor(alreadyPaidStars)));
  const extra = Math.max(0, s - paid);
  return extra * COINS_PER_STAR + (paid === 0 && s > 0 ? FIRST_CLEAR_BONUS : 0);
}

export function endlessReward(distanceM: number): number {
  return Number.isFinite(distanceM) ? Math.max(0, Math.floor(distanceM / ENDLESS_METRES_PER_COIN)) : 0;
}

export function dailyReward(distanceM: number, firstRunToday: boolean): number {
  const base = Number.isFinite(distanceM) ? Math.max(0, Math.floor(distanceM / DAILY_METRES_PER_COIN)) : 0;
  return base + (firstRunToday ? DAILY_PARTICIPATION_BONUS : 0);
}

export type RunResult =
  | { kind: 'campaign'; runId: string; stage: number; stars: number }
  | { kind: 'endless'; runId: string; distanceM: number }
  | { kind: 'daily'; runId: string; distanceM: number; day: string };

// Apply a finished run to a save. Returns the updated save and the
// coins earned (0 when this run was already rewarded).
export function applyRunResult(save: Save, r: RunResult): { save: Save; earned: number } {
  if (save.lastRewardedRun === r.runId) return { save, earned: 0 };
  let earned = 0;
  let next: Save = { ...save, lastRewardedRun: r.runId };
  if (r.kind === 'campaign') {
    const paid = ownNum(save.coinStars, r.stage);
    earned = campaignReward(r.stars, paid);
    if (r.stars > paid) next = { ...next, coinStars: { ...save.coinStars, [r.stage]: Math.min(3, r.stars) } };
  } else if (r.kind === 'endless') {
    earned = endlessReward(r.distanceM);
    next = { ...next, endlessBest: Math.max(save.endlessBest, Math.floor(r.distanceM)) };
  } else {
    const sameDay = save.daily?.day === r.day;
    earned = dailyReward(r.distanceM, !sameDay);
    next = {
      ...next,
      daily: { day: r.day, best: Math.max(sameDay ? save.daily!.best : 0, Math.floor(r.distanceM)) },
    };
  }
  next = { ...next, coins: clampCoins(save.coins + earned) };
  return { save: next, earned };
}

export type PurchaseResult =
  | { ok: true; save: Save }
  | { ok: false; reason: 'unknown' | 'owned' | 'funds' };

export function purchaseOutfit(save: Save, id: OutfitId): PurchaseResult {
  const o = outfitById(id);
  if (!o) return { ok: false, reason: 'unknown' };
  if (save.outfits.includes(id)) return { ok: false, reason: 'owned' };
  if (save.coins < o.price) return { ok: false, reason: 'funds' };
  return {
    ok: true,
    save: { ...save, coins: clampCoins(save.coins - o.price), outfits: [...save.outfits, id], outfit: id },
  };
}

export function equipOutfit(save: Save, id: OutfitId): Save {
  return save.outfits.includes(id) || FREE_OUTFITS.includes(id) ? { ...save, outfit: id } : save;
}
