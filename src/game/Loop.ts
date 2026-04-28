// Fixed-timestep loop with accumulator. Sim runs at 60Hz regardless of render rate.

const STEP = 1 / 60;
const MAX_FRAME = 0.1; // clamp huge frame jumps (background -> foreground)

export type LoopHandle = {
  stop: () => void;
};

export function startLoop(opts: {
  update: (dt: number) => void;
  render: (alpha: number) => void;
}): LoopHandle {
  let last = performance.now();
  let accum = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    const frame = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accum += frame;
    while (accum >= STEP) {
      opts.update(STEP);
      accum -= STEP;
    }
    opts.render(accum / STEP);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
    },
  };
}
