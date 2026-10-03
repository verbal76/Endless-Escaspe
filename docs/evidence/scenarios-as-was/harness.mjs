// Shared Playwright harness for integration scenarios.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

export async function openGame() {
  const server = spawn('python3', ['-m', 'http.server', '8766', '-d', 'dist'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
  const errors = [];
  const allLogs = [];
  page.on('console', (m) => allLogs.push(m.text()));
  page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8766/');
  await page.waitForFunction(() => !!globalThis.__ee, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const close = async () => { await browser.close(); server.kill(); };
  return { page, errors, close, allLogs };
}

export const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

// Start a fresh run at a given stage with the start screen dismissed.
export async function startStage(page, stage, seed = 4242) {
  await page.evaluate(({ stage, seed }) => {
    const st = globalThis.__ee.useStore.getState();
    st.setShowTutorial?.(false);
    st.setStage(stage);
    st.startRun();
    st.resetForSegment(seed);
  }, { stage, seed });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const st = globalThis.__ee.useStore.getState();
    st.setGameModal(null);
    st.setPaused(false);
  });
  await page.waitForTimeout(200);
}
