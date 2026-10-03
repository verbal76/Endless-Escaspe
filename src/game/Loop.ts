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
// Vsync jitter tolerance. On a 60 Hz display the frame period equals
// STEP, so +-0.3 ms of jitter flipped the accumulator between 0 and 2
// sim steps per render on about half the frames (visible stutter: a
// repeated position, then a double step). An accumulator within SNAP of
// a whole number of steps is treated as exactly that many; the error is
// at most SNAP per frame and averages out.
export const SNAP = 0.002;
// While the caller says the picture is static (paused menu over the
// scene), draw only every RENDER_THROTTLE-th frame.
export const RENDER_THROTTLE = 4;

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
  // Optional: true while nothing on screen moves (e.g. paused). Renders
  // are then throttled to every RENDER_THROTTLE-th frame; the first
  // frame after it turns false renders as usual.
  isStatic?: () => boolean;
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
  let staticFrames = 0;
  let snapped = 0; // net sim time added (+) / dropped (-) by snapping

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
    // Snap, but never let the snapped time add up to more than half a
    // step either way: on a display that is really 59 or 61 Hz the
    // snaps would otherwise run the sim ~2 % slow / fast for good.
    const whole = Math.round(accum / STEP);
    const delta = whole * STEP - accum;
    if (whole >= 1 && Math.abs(delta) < SNAP && Math.abs(snapped + delta) <= STEP / 2) {
      accum += delta;
      snapped += delta;
    }
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
    let draw = true;
    try {
      if (opts.isStatic?.()) {
        draw = staticFrames % RENDER_THROTTLE === 0;
        staticFrames++;
      } else {
        staticFrames = 0;
      }
    } catch {
      staticFrames = 0;
    }
    try {
      if (draw) opts.render(Math.max(0, accum) / STEP);
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
