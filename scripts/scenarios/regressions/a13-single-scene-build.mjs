// A-13: a stage clear built the scene twice (under the "YOU MADE IT!" banner
// and again on NEXT STAGE). Fixed: the world behind the banner is kept until
// NEXT STAGE, which builds the next stage exactly once.
const J = JSON.stringify;
export default [{
  id: 'a13-single-scene-build',
  title: 'A-13 a stage clear builds the next scene once, on NEXT STAGE',
  tags: ['campaign', 'ui'],
  save: 9,
  async run({ page, check, start }) {
    await start({ stage: 5, seed: 9001 });
    const r = await page.evaluate(() => {
      const E = globalThis.__ee, H = globalThis.__h; const st = () => E.useStore.getState();
      const roots = [E.scene.root];
      const note = () => { if (roots[roots.length - 1] !== E.scene.root) roots.push(E.scene.root); };
      E.player.z = 60; H.tick(12); note();
      E.handleWin(); H.tick(24); note();
      const bannerBuilds = roots.length - 1;
      const stageAtBanner = st().stage, run = st().runState;
      st().resetForSegment(st().segmentSeed + 1); H.tick(30); note();
      return { bannerBuilds, totalBuilds: roots.length - 1, run, stageAtBanner, stageAfter: st().stage };
    });
    check('A-13 no rebuild while the stage-clear banner is up', r.run === 'cleared' && r.bannerBuilds === 0, J(r));
    check('A-13 NEXT STAGE builds the next scene exactly once', r.totalBuilds === 1, J(r));
  },
}];
