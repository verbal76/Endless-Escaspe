// B: segments whose only route is too narrow for the guard nav grid (guards/dogs/bot can't follow).
import * as THREE from 'three';
import { ProcgenSystem } from '../../../../../../../home/user/Endless-Escaspe/src/systems/ProcgenSystem';
import { CHUNK_LEN, CHUNKS_AHEAD } from '../../../../../../../home/user/Endless-Escaspe/src/util/geometry';
import { chunkDensityFor, forksEnabledFor, segmentLengthMulFor } from '../../../../../../../home/user/Endless-Escaspe/src/util/progression';
let n = 0, narrow = 0; const ex: string[] = [];
for (let stage = 1; stage <= 29; stage++) { if (stage % 10 === 0) continue; for (const seed of [501, 502, 503, ...Array.from({ length: 30 }, (_, i) => 7000 + i)]) {
  const chunkCount = Math.max(CHUNKS_AHEAD, Math.round(CHUNKS_AHEAD * segmentLengthMulFor(stage)));
  const forkSide: -1 | 1 = (seed & 2) === 0 ? 1 : -1; const forkChunk = forksEnabledFor(stage) && chunkCount >= 5 ? 2 + (seed % 2) : -1;
  const p = new ProcgenSystem(seed, new THREE.Group(), chunkCount, 0, (i) => ({ spec: chunkDensityFor(stage), fork: i === forkChunk ? forkSide : undefined }));
  p.init(); n++;
  const g = p.nav; const start = g.nearestFree(0, 1, 4)!; const end = chunkCount * CHUNK_LEN;
  const m = g.flood([start]); let maxRow = -1; for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (m[r * g.cols + c]) maxRow = Math.max(maxRow, r);
  const reachZ = g.rowZ(maxRow);
  if (reachZ < end - 1) { narrow++; if (ex.length < 12) ex.push(`stage ${stage} seed ${seed}: guard-grid reach stops at z=${reachZ.toFixed(1)} of ${end}`); }
} }
console.log(`segments where the guard nav grid (inflate 0.7) cannot get from spawn to the win line: ${narrow}/${n}`); ex.forEach((e) => console.log('  ' + e));
