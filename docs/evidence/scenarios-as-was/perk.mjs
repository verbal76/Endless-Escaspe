import { openGame } from './harness.mjs';
const { page, errors, close } = await openGame();
const r = await page.evaluate(async () => {
  const E = globalThis.__ee; const S = () => E.useStore.getState();
  const tick = async (n = 5) => { for (let i = 0; i < n; i++) { E.update(1 / 60); } await new Promise((r) => setTimeout(r, 50)); };
  S().upsertSave({ name: 'Perk', skin: 'beige', stage: 10, bestStars: {}, updatedAt: 1, tipsSeen: [], coins: 0, coinStars: {}, lastRewardedRun: null, outfits: ['classic'], outfit: 'classic', endlessBest: 0, daily: null, perkStages: 0 });
  S().setActiveSave('perk'); S().setGameMode('campaign'); S().setStage(10); S().setShowTutorial(false);
  S().startRun({ perkStages: 0 }); await tick();
  S().setGameModal(null); S().setPaused(false);
  const arena = E.scene.isBossArena;
  E.handleWin(); await tick();
  const saved = S().saves['perk'];
  const heartsNext = S().hearts;
  S().setRunState('idle'); await tick();
  // reload from the menu with the saved perk
  S().setStage(saved.stage); S().startRun({ perkStages: saved.perkStages }); await tick();
  const heartsReload = S().hearts, perkAfter = S().perkRemainingStages;
  // final death clears the saved perk
  for (let i = 0; i < 6 && S().runState === 'playing'; i++) { E.handleCatch('arrested'); for (let k = 0; k < 40; k++) E.update(1 / 60); await new Promise((r) => setTimeout(r, 30)); }
  return { arena, savedStage: saved.stage, savedPerk: saved.perkStages, heartsNext, heartsReload, perkAfter, runState: S().runState, perkOnDisk: S().saves['perk'].perkStages };
});
console.log(JSON.stringify(r), errors.filter((e) => !e.includes('404')));
await close();
