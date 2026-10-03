import { openGame, startStage } from './harness.mjs';
const { page, errors, close } = await openGame();
await startStage(page, 16, 222);
const c = await page.evaluate(() => {
  const E = globalThis.__ee;
  const cam = E.scene.cameras[0];
  const before = E.scene.guards.length;
  E.scene.procgen.obstacles().length = 0;
  let toast = null, steps = 0;
  for (; steps < 60 * 60 && E.scene.guards.length === before; steps++) {
    E.player.x = cam.x + Math.sin(cam.facing) * 4; E.player.z = cam.z;
    for (const g of E.scene.guards) g.stunTimer = 1;
    for (const dg of E.scene.dogs) { dg.state = 'flee'; dg.stateTimer = 999; dg.x = 8; dg.z = -1.5; }
    E.update(1 / 60);
    toast = E.useStore.getState().toast?.text ?? toast;
  }
  const added = E.scene.guards[E.scene.guards.length - 1];
  return { steps, before, after: E.scene.guards.length, toast, state: added.state, alarm: E.useStore.getState().alarmLevel };
});
console.log(JSON.stringify(c), errors);
await close();
