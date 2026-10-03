// B-e3: Daily = same seed. World (props, pickups, guard homes, weather) is identical run to run,
// but guard behaviour is not: GuardAI / Dog use Math.random. Same input script, two runs.
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
async function run(seedRandom) {
  await startManual(page, 1, 20261002, 'daily');
  return page.evaluate((seedRandom) => {
    const E = globalThis.__ee; const S = E.scene;
    if (seedRandom !== null) globalThis.__seedRandom(seedRandom); else globalThis.__unseedRandom();
    const world = S.procgen.obstacles().map((o) => `${o.kind}${o.x.toFixed(2)},${o.z.toFixed(2)}`).join('|') + '#' + S.procgen.pickups().map((p) => `${p.kind}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join('|') + '#' + S.guards.map((g) => `${g.homeX.toFixed(2)},${g.homeZ.toFixed(2)}`).join('|') + '#' + E.useStore.getState().weather;
    // identical scripted input: walk forward crouched along x=-3 for 20 s
    const trace = [];
    for (let f = 0; f < 1200; f++) { E.input.stance = 'crouch'; E.input.axisX = 0; E.input.axisY = 0.5; E.update(1 / 60); if (f % 300 === 299) trace.push(S.guards.slice(0, 3).map((g) => `${g.x.toFixed(2)},${g.z.toFixed(2)}`).join(' ')); }
    globalThis.__unseedRandom();
    let h = 0; for (const c of world) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    return { worldHash: h, nObs: S.procgen.obstacles().length, trace, hearts: E.useStore.getState().hearts, dist: E.useStore.getState().distance ?? null, playerZ: +E.player.z.toFixed(2) };
  }, seedRandom);
}
const a = await run(null), b = await run(null), c = await run(5), d = await run(5);
console.log('unseeded run A', JSON.stringify(a)); console.log('unseeded run B', JSON.stringify(b));
console.log('world identical:', a.worldHash === b.worldHash, ' guard traces identical:', JSON.stringify(a.trace) === JSON.stringify(b.trace));
console.log('with Math.random seeded identically (C vs D): traces identical:', JSON.stringify(c.trace) === JSON.stringify(d.trace));
console.log('errors', errors); await close();
