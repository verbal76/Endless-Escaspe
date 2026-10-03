// B: moodStageFor (Game.tsx:614-615) copied verbatim. Distribution over real seed ranges.
const moodStageFor = (stage, mode, seed) => mode === 'campaign' ? stage : 1 + (((seed >>> 0) * 2654435761) >>> 0) % 4;
const fnv1a = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const hist = (seeds) => { const h = { 1: 0, 2: 0, 3: 0, 4: 0 }; for (const s of seeds) h[moodStageFor(1, 'endless', s)]++; return h; };
const endlessSeeds = Array.from({ length: 10000 }, () => (Math.random() * 0x7fffffff) | 0); // StartScreen.tsx:346 / Banner.tsx:191
const dailySeeds = []; for (let d = 0; d < 365; d++) { const day = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10); dailySeeds.push(fnv1a(`endless-escape:daily:${day}:rules-v1`) || 1); }
console.log('Endless (10000 random seeds) mood histogram:', JSON.stringify(hist(endlessSeeds)));
console.log('Daily (365 days of 2026) mood histogram:', JSON.stringify(hist(dailySeeds)));
console.log('small seeds 1..1000:', JSON.stringify(hist(Array.from({ length: 1000 }, (_, i) => i + 1))));
const fixed = (seed) => 1 + (Math.imul(seed >>> 0, 2654435761) >>> 0) % 4;
const hf = { 1: 0, 2: 0, 3: 0, 4: 0 }; for (const s of endlessSeeds) hf[fixed(s)]++; console.log('with Math.imul (fix) endless:', JSON.stringify(hf));
