// Fixed-timestep loop with accumulator. Sim runs at 60Hz regardless of render rate.
//
// Resilient by construction: the next frame is always scheduled, and an
// exception in update/render is caught and reported instead of silently
// ending the loop (which froze the game for good - the player could no
// longer move and nothing said why). After FATAL_AFTER consecutive
// failing frames `onFatal` is called once so the app can recover (e.g.
// offer a return to the menu); a frame that succeeds resets the count.

const STEP = 1 / 60;
const MAX_FRAME = 0.1; // clamp huge frame jumps (background -> foreground)
export const FATAL_AFTER = 30;

export type LoopHandle = {
  stop: () => void;
};

export type LoopOptions = {
  update: (dt: number) => void;
  render: (alpha: number) => void;
  // Every caught error (throttling is the caller's choice).
  onError?: (err: unknown, phase: 'update' | 'render') => void;
  // Once, after FATAL_AFTER failing frames in a row.
  onFatal?: (err: unknown) => void;
  // Injection points for tests.
  now?: () => number;
  schedule?: (cb: (now: number) => void) => void;
};

export function startLoop(opts: LoopOptions): LoopHandle {
  const now = opts.now ?? (() => performance.now());
  const schedule = opts.schedule ?? ((cb) => requestAnimationFrame(cb));
  let last = now();
  let accum = 0;
  let stopped = false;
  let failedFrames = 0;
  let fatalReported = false;

  const report = (err: unknown, phase: 'update' | 'render') => {
    try {
      opts.onError?.(err, phase);
    } catch {
      // A failing reporter must not take the loop down either.
    }
  };

  const tick = (t: number) => {
    if (stopped) return;
    // Schedule first: whatever happens below, the loop keeps running.
    schedule(tick);
    const frame = Math.min(Math.max(0, (t - last) / 1000), MAX_FRAME);
    last = t;
    accum += frame;
    let failed: unknown = null;
    let stepped = false;
    try {
      while (accum >= STEP) {
        accum -= STEP;
        opts.update(STEP);
        stepped = true;
      }
    } catch (err) {
      failed = err;
      accum = 0; // don't replay the backlog into the same fault
      report(err, 'update');
    }
    try {
      opts.render(accum / STEP);
    } catch (err) {
      failed = failed ?? err;
      report(err, 'render');
    }
    if (failed === null) {
      // Only a frame that actually ran the sim cleanly ends a failure
      // streak (a frame with no sim step proves nothing).
      if (stepped) {
        failedFrames = 0;
        fatalReported = false;
      }
      return;
    }
    failedFrames++;
    if (failedFrames >= FATAL_AFTER && !fatalReported) {
      fatalReported = true;
      try {
        opts.onFatal?.(failed);
      } catch {
        // ignore
      }
    }
  };

  schedule(tick);

  return {
    stop: () => {
      stopped = true;
    },
  };
}
