// Short in-game prompts that teach one mechanic at a time, when the
// player first meets it: a few stage-start tips for rules that arrive
// with a stage, and contextual "first time you see X" tips. Each tip
// shows at most once per character save (ids are stored in
// Save.tipsSeen) and never more than one at a time. The intro
// (Tutorial.tsx) covers only what matters on stage 1; the full rules
// live in the How to Play reference (HowToPlay.tsx).

export type TipId =
  | 'stage1'
  | 'crouch'
  | 'floodlight'
  | 'fork'
  | 'crowbar'
  | 'smokebomb'
  | 'rock'
  | 'stage5'
  | 'stage6'
  | 'searchlight'
  | 'dogs'
  | 'perk'
  | 'cameras'
  | 'stage12'
  | 'razor'
  | 'hearts1'
  | 'aimed'
  | 'endless'
  | 'daily';

// Kept short: a tip is read while playing.
export const TIPS: Record<TipId, string> = {
  stage1: 'Reach the green line. Stay out of the guards’ cones.',
  crouch: 'Low wall: CROUCH behind it to hide.',
  floodlight: 'Floodlights alert every guard. Crouch or keep moving.',
  fork: 'Fork: the guarded lane has 2 pickups. The long lane has no post.',
  crowbar: 'Crowbar: stuns a nearby guard for 4 s or scares dogs. A miss wastes it.',
  smokebomb: 'Smoke: guards can’t see through it for 5 s. Cameras can.',
  rock: 'Rock: THROW lands ahead. Guards nearby go check the noise.',
  stage5: 'RUN now drains stamina. Empty bar: wait before running again.',
  stage6: 'Guards now stop and scan where they last saw you.',
  searchlight: 'Some floodlights now follow you. Get out of the beam fast.',
  dogs: 'Dogs charge up close. Outrun them with RUN, or use smoke or a crowbar.',
  perk: 'Boss beaten: +1 heart for the next 10 stages.',
  cameras: 'Camera! Get behind cover. A full alarm brings guards.',
  stage12: 'Guards now radio each other when one spots you.',
  razor: 'Razor wire: touching the side fence costs a heart.',
  hearts1: 'From here you start with 1 heart. No mistakes.',
  aimed: 'Laser = shot incoming. Break line of sight!',
  endless: 'Endless: go as far as you can. It gets harder every 120 m.',
  daily: 'Daily: the same yard for everyone today. How far can you get?',
};

// Campaign: tips tied to the stage that introduces a rule. (The boss
// arena at 10 has its own popup; cameras, floodlights and low walls are
// taught when first seen, in every mode.)
const STAGE_TIPS: Array<[number, TipId]> = [
  [1, 'stage1'],
  [5, 'stage5'],
  [6, 'stage6'],
  [8, 'dogs'],
  [8, 'searchlight'],
  [12, 'stage12'],
  [14, 'razor'],
  [20, 'hearts1'],
];

// Endless / Daily: the same rules arrive with the difficulty level
// (1 + distance / 120 m), so the tips fire when that level is reached.
const LEVEL_TIPS: Array<[number, TipId]> = [
  [5, 'stage5'],
  [6, 'stage6'],
  [8, 'dogs'],
  [8, 'searchlight'],
  [12, 'stage12'],
  [14, 'razor'],
];

// Tips to show at the start of a campaign stage that are still unseen:
// the ones for this exact stage, or a missed one from the last two
// stages (a save that skipped ahead). A veteran save loaded far past a
// rule isn't lectured about it.
export function stageStartTips(stage: number, seen: readonly string[]): TipId[] {
  return STAGE_TIPS.filter(([s, id]) => s <= stage && s >= stage - 2 && !seen.includes(id)).map(([, id]) => id);
}

// Endless / Daily: unseen tips for rules that switch on at this level.
export function levelTips(level: number, seen: readonly string[]): TipId[] {
  return LEVEL_TIPS.filter(([l, id]) => l === level && !seen.includes(id)).map(([, id]) => id);
}

export function contextTip(id: TipId, seen: readonly string[]): TipId | null {
  return seen.includes(id) ? null : id;
}
