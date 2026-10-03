import { openGame, startStage } from '../h.mjs';
const { page, errors, logs, close } = await openGame(8803);
const r = await page.evaluate(() => {
  const E = globalThis.__ee;
  const R = E.renderer.renderer;
  return { keys: Object.keys(E), info: JSON.parse(JSON.stringify(R.info.memory)), render: JSON.parse(JSON.stringify(R.info.render)), pr: R.getPixelRatio(), size: [R.domElement?.width, R.domElement?.height], dpr: devicePixelRatio, progs: R.info.programs?.length, sceneKeys: Object.keys(E.scene) };
});
console.log(JSON.stringify(r, null, 1));
console.log(errors, logs.slice(0, 30));
await close();
