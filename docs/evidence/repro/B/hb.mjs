// B harness helpers: port 8802, manual fixed-step driving of the frozen build.
import { openGame } from '../h.mjs';
export const PORT = 8802;
export async function boot() {
  const g = await openGame(PORT);
  await g.page.evaluate(() => {
    const orig = Math.random; globalThis.__origRandom = orig;
    globalThis.__seedRandom = (s) => { let a = s >>> 0; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    globalThis.__unseedRandom = () => { Math.random = orig; };
    window.requestAnimationFrame = () => 0; // kill the live loop: tests drive __ee.update(1/60)
  });
  await g.page.waitForTimeout(200);
  return g;
}
// Start a stage (campaign or mode) and settle it with manual updates.
export async function startManual(page, stage, seed, mode = 'campaign') {
  return page.evaluate(({ stage, seed, mode }) => {
    const E = globalThis.__ee; const st = E.useStore.getState();
    st.setShowTutorial?.(false);
    E.useStore.setState({ gameMode: mode });
    st.setStage(stage); st.startRun(); st.resetForSegment(seed);
    E.update(1 / 60);
    const s2 = E.useStore.getState(); s2.setGameModal(null); s2.setPaused(false);
    E.update(1 / 60);
    return { stage: E.useStore.getState().stage, mode: E.useStore.getState().gameMode, hearts: E.useStore.getState().hearts, guards: E.scene.guards.length, run: E.useStore.getState().runState };
  }, { stage, seed, mode });
}
