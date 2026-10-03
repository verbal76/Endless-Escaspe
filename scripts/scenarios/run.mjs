#!/usr/bin/env node
// Browser scenario runner. See README.md.
//
//   node scripts/scenarios/run.mjs --pack all
//   node scripts/scenarios/run.mjs --pack pack5 --only endless
//   node scripts/scenarios/run.mjs --only combat,stealth
//   node scripts/scenarios/run.mjs --list
//
// Options
//   --pack <review|pack2|pack5|regressions|all>   default: all
//   --only <a,b,...>    run scenarios whose id, "<pack>/<id>" or any tag matches
//   --dist <dir>        use an existing web export (default: build into the temp dir)
//   --build             force a rebuild even if the temp export exists
//   --port <n>          static server port (default $EE_SCENARIO_PORT or 8830)
//   --json <file>       also write every check (pack, scenario, name, ok, detail) as JSON
//   --list              print the scenarios and tags, run nothing
// Env: EE_CHROME (browser executable), PLAYWRIGHT_BROWSERS_PATH, EE_PLAYWRIGHT_DIR,
//      EE_SCENARIO_BUILD_DIR, EE_SCENARIO_WEBDEPS_DIR.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { launchGame } from './lib/runtime.mjs';
import { makeCtx } from './lib/ctx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { pack: 'all', only: null, dist: null, build: false, port: Number(process.env.EE_SCENARIO_PORT ?? 8830), json: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${k} needs a value`); return argv[++i]; };
    if (k === '--pack') a.pack = val();
    else if (k === '--only') a.only = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--dist') a.dist = val();
    else if (k === '--build') a.build = true;
    else if (k === '--port') a.port = Number(val());
    else if (k === '--json') a.json = val();
    else if (k === '--list') a.list = true;
    else if (k === '-h' || k === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

async function loadPacks() {
  const packs = [];
  for (const name of ['review', 'pack2', 'pack5']) {
    const mod = await import(pathToFileURL(path.join(here, 'packs', `${name}.mjs`)).href);
    packs.push({ name, scenarios: mod.default });
  }
  const regDir = path.join(here, 'regressions');
  const scenarios = [];
  for (const f of fs.readdirSync(regDir).filter((f) => f.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(regDir, f)).href);
    scenarios.push(...[].concat(mod.default));
  }
  packs.push({ name: 'regressions', scenarios });
  for (const p of packs) for (const s of p.scenarios) {
    if (!s.id || !s.tags?.length || typeof s.run !== 'function') throw new Error(`scenario in ${p.name} needs id, tags and run: ${JSON.stringify(s.id)}`);
  }
  return packs;
}

const matches = (pack, s, only) => !only || only.some((o) => o === s.id || o === `${pack}/${s.id}` || s.tags.includes(o));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allPacks = await loadPacks();
  const known = new Set(allPacks.map((p) => p.name));
  if (args.pack !== 'all' && !known.has(args.pack)) throw new Error(`--pack must be one of ${[...known].join('|')}|all`);
  const selected = allPacks
    .filter((p) => args.pack === 'all' || p.name === args.pack)
    .map((p) => ({ name: p.name, scenarios: p.scenarios.filter((s) => matches(p.name, s, args.only)) }))
    .filter((p) => p.scenarios.length);

  if (args.list) {
    for (const p of allPacks) for (const s of p.scenarios) console.log(`${p.name}/${s.id}\t[${s.tags.join(',')}]\t${s.title ?? ''}`);
    return 0;
  }
  if (!selected.length) throw new Error(`nothing matches --pack ${args.pack}${args.only ? ' --only ' + args.only.join(',') : ''} (try --list)`);

  let dist = args.dist;
  if (!dist) {
    const dir = path.resolve(process.env.EE_SCENARIO_BUILD_DIR ?? path.join(os.tmpdir(), 'ee-scenarios-build'));
    dist = path.join(dir, 'dist');
    if (args.build || !fs.existsSync(path.join(dist, 'index.html'))) dist = build({ workDir: dir });
  }

  const all = [];
  const crashed = [];
  const t00 = Date.now();
  for (const pack of selected) {
    console.log(`\n=== pack ${pack.name} (${pack.scenarios.length} scenarios) ===`);
    const game = await launchGame({ dist, port: args.port });
    try {
      for (const s of pack.scenarios) {
        const t0 = Date.now();
        const mine = [];
        const ctx = makeCtx(game.page, (r) => {
          mine.push(r);
          all.push({ pack: pack.name, scenario: s.id, ...r });
          console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
        });
        try {
          if (s.save) await ctx.ensureSave(s.save);
          await s.run(ctx);
          if (!mine.length) throw new Error('scenario produced no checks');
        } catch (e) {
          const r = { name: `${s.id} (scenario error)`, ok: false, detail: String(e?.message ?? e).split('\n')[0] };
          mine.push(r);
          all.push({ pack: pack.name, scenario: s.id, ...r });
          crashed.push(`${pack.name}/${s.id}`);
          console.log(`FAIL ${r.name} :: ${r.detail}`);
        }
        console.log(`  - ${s.id} [${s.tags.join(',')}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
      const bad = game.errors.filter((x) => !/play\(\) failed|404/.test(x));
      const r = { name: `${pack.name}: no page errors`, ok: bad.length === 0, detail: bad.slice(0, 5).join(' | ') };
      all.push({ pack: pack.name, scenario: '(page)', ...r });
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
    } finally {
      await game.close();
    }
  }

  const failed = all.filter((r) => !r.ok);
  console.log('\n=== summary ===');
  for (const pack of selected) {
    const rs = all.filter((r) => r.pack === pack.name);
    console.log(`${pack.name.padEnd(12)} ${rs.length - rs.filter((r) => !r.ok).length}/${rs.length} checks passed`);
  }
  console.log(`total        ${all.length - failed.length}/${all.length} checks passed in ${((Date.now() - t00) / 1000).toFixed(0)}s`);
  for (const f of failed) console.log(`  FAILED ${f.pack}/${f.scenario}: ${f.name}`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(all, null, 1));
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(`scenario runner: ${e.message}`); process.exit(2); });
