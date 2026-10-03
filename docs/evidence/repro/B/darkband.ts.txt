// B: how much of a campaign segment can be walked inside the never-lit centre band (|x|<=0.55)?
import * as THREE from 'three';
import { ProcgenSystem } from '../../../../../../../home/user/Endless-Escaspe/src/systems/ProcgenSystem';
import { CHUNK_LEN, CHUNKS_AHEAD } from '../../../../../../../home/user/Endless-Escaspe/src/util/geometry';
import { chunkDensityFor, forksEnabledFor, segmentLengthMulFor } from '../../../../../../../home/user/Endless-Escaspe/src/util/progression';
import { reachMask } from './oracle';
for (const stage of [8, 12, 16, 22]) {
  let frac = 0, n = 0;
  for (let s = 0; s < 30; s++) {
    const seed = 5000 + s * 31; const chunkCount = Math.max(CHUNKS_AHEAD, Math.round(CHUNKS_AHEAD * segmentLengthMulFor(stage)));
    const forkSide: -1 | 1 = (seed & 2) === 0 ? 1 : -1; const forkChunk = forksEnabledFor(stage) ? 2 + (seed % 2) : -1;
    const p = new ProcgenSystem(seed, new THREE.Group(), chunkCount, 0, (i) => ({ spec: chunkDensityFor(stage), fork: i === forkChunk ? forkSide : undefined }));
    p.init(); const end = chunkCount * CHUNK_LEN; const m = reachMask(p.obstacles(), 0, 1, -2, end + 1);
    // fraction of 1 m rows in which some reachable point with |x|<=0.55 exists
    let ok = 0; for (let z = 0; z < end; z += 1) { let any = false; for (let x = -0.55; x <= 0.55 && !any; x += 0.1) if (m.at(x, z, 0.1)) any = true; if (any) ok++; }
    frac += ok / end; n++;
  }
  console.log(`stage ${stage}: average share of the segment's length where the never-lit band is walkable: ${(100 * frac / n).toFixed(0)}%`);
}
