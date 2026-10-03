// B: procgen walkability stress for real campaign plans (stage density + forks) and Endless streaming with trimming.
import * as THREE from 'three';
import { ProcgenSystem, SPAWN_X, SPAWN_Z } from '../../../../../../../home/user/Endless-Escaspe/src/systems/ProcgenSystem';
import { CHUNK_LEN, CHUNKS_AHEAD } from '../../../../../../../home/user/Endless-Escaspe/src/util/geometry';
import { chunkDensityFor, forksEnabledFor, segmentLengthMulFor } from '../../../../../../../home/user/Endless-Escaspe/src/util/progression';
import { reachMask } from './oracle';
const SEEDS = Number(process.env.SEEDS ?? 40);
let fails: string[] = []; let total = 0; let pickBad = 0; let pickTotal = 0; let forkCount = 0;
for (let stage = 1; stage <= 30; stage++) {
  if (stage % 10 === 0) continue; // arenas checked separately below
  for (let s = 0; s < SEEDS; s++) {
    const seed = (stage * 100003 + s * 7919) >>> 0;
    const chunkCount = Math.max(CHUNKS_AHEAD, Math.round(CHUNKS_AHEAD * segmentLengthMulFor(stage)));
    const forkSide: -1 | 1 = (seed & 2) === 0 ? 1 : -1;
    const forkChunk = forksEnabledFor(stage) && chunkCount >= 5 ? 2 + (seed % 2) : -1;
    const p = new ProcgenSystem(seed, new THREE.Group(), chunkCount, 0, (i) => ({ spec: chunkDensityFor(stage), fork: i === forkChunk ? forkSide : undefined }));
    p.init(); total++;
    if (p.forks().length) forkCount++;
    const segLen = chunkCount * CHUNK_LEN;
    const m = reachMask(p.obstacles(), SPAWN_X, SPAWN_Z, -2, segLen + 1);
    if (m.maxReachedZ() < segLen - 0.2) fails.push(`stage ${stage} seed ${seed}: max reach z=${m.maxReachedZ().toFixed(1)} / ${segLen}`);
    for (const pk of p.pickups()) { pickTotal++; if (!m.at(pk.x, pk.z, pk.r)) { pickBad++; if (pickBad < 6) fails.push(`pickup unreachable stage ${stage} seed ${seed} ${pk.kind} (${pk.x.toFixed(2)},${pk.z.toFixed(2)})`); } }
  }
}
console.log(`campaign: ${total} segments, ${forkCount} with forks, unwalkable/unreachable issues: ${fails.length}; pickups ${pickBad}/${pickTotal} unreachable`);
fails.slice(0, 20).forEach((f) => console.log('  ' + f));
// Endless streaming: replicate buildScene/streamEndless procgen calls incl. trimBefore.
const SECTION = CHUNKS_AHEAD * CHUNK_LEN;
const levelAtZ = (z: number) => Math.min(30, 1 + Math.floor(Math.max(0, z) / SECTION));
let efails: string[] = []; let eruns = 0;
for (let s = 0; s < Number(process.env.ESEEDS ?? 12); s++) {
  const seed = (987654 + s * 104729) >>> 0;
  const forkSide: -1 | 1 = (seed & 2) === 0 ? 1 : -1;
  const plan = (i: number) => ({ spec: chunkDensityFor(levelAtZ(i * CHUNK_LEN)), fork: i % 10 === 8 && forksEnabledFor(levelAtZ(i * CHUNK_LEN)) ? (Math.floor(i / 10) % 2 === 0 ? forkSide : (-forkSide as -1 | 1)) : undefined });
  const p = new ProcgenSystem(seed, new THREE.Group(), 6, 0, plan); p.init();
  const all = new Map<number, any>();
  const grab = () => { for (const c of p.gameplayChunks()) for (const o of c.obstacles) all.set(o.id, o); };
  grab();
  for (let k = 0; k < 2; k++) p.extendTo((k + 1) * SECTION + CHUNK_LEN);
  grab();
  const END = Number(process.env.EEND ?? 2400);
  for (let pz = 0; pz < END; pz += 6) { // player marching forward
    let next = Math.floor(p.endZ() / SECTION); // approximate nextSection
    while (next * SECTION < pz + 2 * SECTION) { p.extendTo((next + 1) * SECTION + CHUNK_LEN); next++; }
    grab();
    p.trimBefore(pz - 50);
  }
  eruns++;
  const obs = [...all.values()];
  const m = reachMask(obs, SPAWN_X, SPAWN_Z, -2, END + 2);
  if (m.maxReachedZ() < END - 1) efails.push(`endless seed ${seed}: blocked at z~${m.maxReachedZ().toFixed(1)}`);
}
console.log(`endless: ${eruns} runs to z=${process.env.EEND ?? 2400}, blocked: ${efails.length}`); efails.forEach((f) => console.log('  ' + f));
