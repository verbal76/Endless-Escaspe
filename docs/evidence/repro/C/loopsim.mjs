// Replays Loop.ts's accumulator for different display rates and counts
// how many sim steps each rendered frame shows (0 = repeated frame).
const STEP = 1 / 60, MAX = 0.1;
for (const hz of [60, 90, 120, 144, 50, 45]) {
  let last = 0, accum = 0; const hist = {}; const seq = [];
  for (let f = 1; f <= hz * 2; f++) {
    const now = f * 1000 / hz + (Math.random() - 0.5) * 0.6; // 0.3 ms vsync jitter
    accum += Math.min((now - last) / 1000, MAX); last = now;
    let n = 0; while (accum >= STEP) { n++; accum -= STEP; }
    hist[n] = (hist[n] || 0) + 1; if (seq.length < 12) seq.push(n);
  }
  console.log(`${hz} Hz: steps-per-render histogram ${JSON.stringify(hist)}  first frames ${seq.join('')}`);
}
