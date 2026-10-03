// Review harness: serves the frozen build of 370a624 (with the __ee debug
// hook: input, useStore, player, THREE, scene, renderer, update, render,
// handleCatch, handleWin, ...) on the given port.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function openGame(port, { width = 915, height = 412 } = {}) {
  const server = spawn('python3', ['-m', 'http.server', String(port), '-d', path.join(here, 'dist')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!globalThis.__ee, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const close = async () => { await browser.close(); server.kill(); };
  return { page, errors, logs, close };
}
// Start a campaign stage with the start screen dismissed.
export async function startStage(page, stage, seed = 4242) {
  await page.evaluate(({ stage, seed }) => {
    const st = globalThis.__ee.useStore.getState();
    st.setShowTutorial?.(false);
    st.setStage(stage);
    st.startRun();
    st.resetForSegment(seed);
  }, { stage, seed });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const st = globalThis.__ee.useStore.getState(); st.setGameModal(null); st.setPaused(false); });
  await page.waitForTimeout(200);
}
