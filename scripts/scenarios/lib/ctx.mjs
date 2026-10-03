// Per-scenario context handed to every scenario's run(ctx).
import { createHash } from 'node:crypto';

// A save to receive coins (what the old packs upserted by hand).
export const testSave = (stage) => ({
  name: 'Tester', skin: 'beige', stage, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {},
  lastRewardedRun: null, outfits: ['classic', 'grey'], outfit: 'classic', endlessBest: 0, daily: null,
});

export function makeCtx(page, onResult) {
  const check = (name, ok, detail = '') => {
    onResult({ name, ok: !!ok, detail: String(detail) });
  };

  // Start a run, fully reset and settled by manual stepping, no wall-clock:
  //   mode 'campaign' | 'endless' | 'daily' (+ day 'YYYY-MM-DD')
  // Inputs are zeroed, the PRNG is reseeded from `seed`, and if the requested
  // (stage, seed, mode) is already the live world a throwaway rebuild runs
  // first, so the result never depends on which scenario ran before.
  const start = ({ stage, seed, mode = 'campaign', day = null }) =>
    page.evaluate(({ stage, seed, mode, day }) => {
      const E = globalThis.__ee;
      const H = globalThis.__h;
      const st = () => E.useStore.getState();
      Object.assign(E.input, { axisX: 0, axisY: 0, stance: 'walk', run: false, viewYaw: 0, useCrowbar: false, useSmokeBomb: false, throwRock: false });
      st().setShowTutorial?.(false);
      st().setGameModal(null);
      st().setPaused(false);
      const cur = st();
      if (cur.runState === 'playing' && cur.stage === stage && cur.segmentSeed === seed && cur.gameMode === mode) {
        st().resetForSegment(seed + 1);
        H.seed(seed + 1);
        H.tick(2);
      }
      H.seed(seed);
      st().setGameMode(mode, mode === 'daily' ? day : null);
      st().setStage(stage);
      st().startRun();
      st().resetForSegment(seed);
      H.tick(1);
      st().setGameModal(null);
      st().setPaused(false);
      H.tick(1);
      const s = st();
      return { stage: s.stage, mode: s.gameMode, hearts: s.hearts, guards: E.scene.guards.length, run: s.runState };
    }, { stage, seed, mode, day });

  const ensureSave = (stage) =>
    page.evaluate((save) => {
      const st = globalThis.__ee.useStore.getState();
      st.upsertSave(save);
      st.setActiveSave('tester');
    }, testSave(stage));

  const tick = (n, render = false) => page.evaluate(({ n, render }) => globalThis.__h.tick(n, render), { n, render });

  return { page, check, start, ensureSave, tick };
}

export const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
