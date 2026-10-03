// B-e11: (a) dog smell pumps the handler's meter with no position info -> handler 'investigate'
// with no target (frozen); (b) a leashed dog (2.2 m/s) cannot keep up with an investigating handler (4 m/s).
import { boot, startManual } from './hb.mjs';
const { page, errors, close } = await boot();
await startManual(page, 8, 31337);
const a = await page.evaluate(() => {
  const E = globalThis.__ee; const S = E.scene; const d = S.dogs[0]; const h = S.guards.find((g) => g.id === d.handlerGuardId);
  for (const g of S.guards) if (g !== h) g.stunTimer = 60;
  const log = []; const h0 = { x: h.x, z: h.z };
  for (let f = 0; f < 60 * 12; f++) {
    // crouched & motionless 3 m from the dog, on the side away from the handler
    const ux = d.x - h.x, uz = d.z - h.z, L = Math.hypot(ux, uz) || 1;
    E.player.x = Math.max(-8.4, Math.min(8.4, d.x + (ux / L) * 3)); E.player.z = d.z + (uz / L) * 3;
    E.input.stance = 'crouch'; E.input.axisX = 0; E.input.axisY = 0;
    E.update(1 / 60);
    if (f % 120 === 119) log.push(`t=${((f + 1) / 60).toFixed(0)}s handler ${h.state} det=${(E.useStore.getState().detection[h.id] ?? 0).toFixed(2)} target=${h.investigationTarget ? 'set' : 'null'} lastSeen=${h.lastSeen ? 'y' : 'n'} lastHeard=${h.lastHeard ? 'y' : 'n'} handlerMoved=${Math.hypot(h.x - h0.x, h.z - h0.z).toFixed(1)}m dog=${d.state}`);
    if (E.useStore.getState().catchCounter > 0 && f === 0) {}
  }
  return log;
});
console.log('(a)\n' + a.join('\n'));
await startManual(page, 8, 31337);
const b = await page.evaluate(() => {
  const E = globalThis.__ee; const S = E.scene; const d = S.dogs[0]; const h = S.guards.find((g) => g.id === d.handlerGuardId);
  h.state = 'investigate'; h.behaviorTimer = 0; h.investigationTarget = { x: -h.x, z: h.z + 25 }; h.nav.path = null;
  const log = [];
  for (let f = 0; f < 60 * 10; f++) { E.player.x = 0; E.player.z = -2; E.input.stance = 'crouch'; E.update(1 / 60); if (f % 120 === 119) log.push(`t=${((f + 1) / 60).toFixed(0)}s handler ${h.state} dog ${d.state} dog-handler distance=${Math.hypot(d.x - h.x, d.z - h.z).toFixed(1)}m`); }
  return log;
});
console.log('(b)\n' + b.join('\n'));
console.log('errors', errors.filter((e) => !/play\(\)/.test(e))); await close();
