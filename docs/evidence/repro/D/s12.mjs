import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8804', '-d', '../dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
// slow down image / texture loads so the boot gap is observable
await page.route('**/*.{png,jpg,ttf}', async (route) => { await new Promise(r=>setTimeout(r, 2500)); route.continue(); });
await page.goto('http://localhost:8804/');
const t0 = Date.now();
for (const ms of [1500, 3500]) { await page.waitForTimeout(ms - (Date.now()-t0)); await page.screenshot({ path: `boot_${ms}ms_915x412.png` }); }
console.log(await page.evaluate(()=>document.body.innerText.slice(0,200)));
await browser.close(); server.kill();
