// Short in-game prompts that teach one mechanic at a time during the
// early stages, plus a few contextual "first time you see X" tips.
// Each tip shows at most once per character save (ids are stored in
// Save.tipsSeen) and never more than one at a time.

export type TipId =
  | 'stage1'
  | 'stage2'
  | 'stage3'
  | 'stage4'
  | 'stage5'
  | 'stage6'
  | 'dogs'
  | 'cameras'
  | 'razor'
  | 'boss'
  | 'crowbar'
  | 'smokebomb'
  | 'aimed';

export const TIPS: Record<TipId, string> = {
  stage1: 'Stay out of the guards’ light cones and reach the green line.',
  stage2: 'Moving makes noise — the ring shows how far. CROUCH to sneak quietly.',
  stage3: 'Cover only hides you when it is between you and the guard.',
  stage4: 'Grab pickups on the way: crowbars and smoke bombs.',
  stage5: 'RUN now uses stamina. Run dry and you must recover before sprinting again.',
  stage6: 'Guards now stop and scan where they last saw you before searching.',
  dogs: 'Dogs smell you up close. Sprint away, use smoke, or scare them with a crowbar.',
  cameras: 'Cameras fill the yard alarm. When it fills, a guard is sent to your position.',
  razor: 'Razor wire: touching the fence now costs a heart.',
  boss: 'Boss round: survive the timer. Lose and you must retry the round.',
  crowbar: 'Crowbar: get close and tap it to knock out a guard. The ring shows who is in reach.',
  smokebomb: 'Smoke bomb: blocks every sight line through the cloud for a few seconds.',
  aimed: 'A red laser means a guard is about to shoot — break line of sight!',
};

const STAGE_TIPS: Array<[number, TipId]> = [
  [1, 'stage1'],
  [2, 'stage2'],
  [3, 'stage3'],
  [4, 'stage4'],
  [5, 'stage5'],
  [6, 'stage6'],
  [8, 'dogs'],
  [10, 'boss'],
  [14, 'razor'],
];

// Tip to show at the start of a stage, if any is still unseen. Stage
// tips are only offered on the stage that introduces the mechanic
// (or later, for a save that jumped past it). Cameras arrive with the
// stage-10 boss, so that tip is contextual instead.
export function stageStartTip(stage: number, seen: readonly string[]): TipId | null {
  let best: TipId | null = null;
  for (const [s, id] of STAGE_TIPS) {
    if (s <= stage && !seen.includes(id)) best = id;
  }
  // Prefer the tip for this exact stage; otherwise the latest missed
  // one (never replay earlier basics to a veteran save).
  const exact = STAGE_TIPS.find(([s]) => s === stage);
  if (exact && !seen.includes(exact[1])) return exact[1];
  if (best && STAGE_TIPS.find(([, id]) => id === best)![0] >= stage - 2) return best;
  return null;
}

export function contextTip(id: TipId, seen: readonly string[]): TipId | null {
  return seen.includes(id) ? null : id;
}
