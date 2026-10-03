import { openGame } from '../h.mjs';
const sizes = [[915,412],[851,393],[800,360],[740,360],[640,360],[1280,800]];
for (const [w,h] of sizes) {
  const g = await openGame(8804, { width: w, height: h });
  await g.page.waitForTimeout(1500);
  await g.page.screenshot({ path: `home_${w}x${h}.png` });
  console.log(w,h, g.errors.slice(0,3));
  if (w===915) console.log(g.logs.filter(l=>/font|error/i.test(l)).slice(0,10));
  await g.close();
}
