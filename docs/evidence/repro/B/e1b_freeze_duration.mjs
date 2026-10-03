// B-e1b: after 5 s in a floodlight, how long do the (target-less) investigating guards stand still?
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
console.log(JSON.stringify(await startManual(page, 8, 777)));
const r = await page.evaluate(() => {
  const E = globalThis.__ee; const S = E.scene;
  const t = S.lightTowers.reduce((a, b) => (Math.abs(b.z - 1) < Math.abs(a.z - 1) ? b : a));
  const px = t.x > 0 ? t.x - 4.6 : t.x + 4.6, pz = t.z;
  for (let f = 0; f < 300; f++) { E.player.x = px; E.player.z = pz; if (t.state === 'scan') t.scanAngle = Math.atan2(px - t.x, pz - t.z); E.update(1 / 60); }
  // leave the light: park the player at spawn (behind every guard), crouched and still.
  E.input.stance = 'crouch';
  const out = []; let prev = S.guards.map((g) => ({ x: g.x, z: g.z }));
  for (let f = 1; f <= 60 * 30; f++) {
    E.player.x = 0; E.player.z = -1.5; E.update(1 / 60);
    if (f % 180 === 0) {
      const det = E.useStore.getState().detection;
      out.push(`t+${f / 60}s ` + S.guards.map((g, i) => { const m = Math.hypot(g.x - prev[i].x, g.z - prev[i].z).toFixed(1); return `g${g.id}:${g.state}/${(det[g.id] ?? 0).toFixed(2)}/moved${m}`; }).join(' '));
      prev = S.guards.map((g) => ({ x: g.x, z: g.z }));
    }
  }
  return out;
});
console.log(r.join('\n')); console.log('errors', errors); await close();
