// Desktop runtime (web only): attaches the pure action layer to the browser, the game's `input` object and
// the zustand store. Imported ONLY by DesktopLayer.tsx, which exists only in the web bundle (the Android
// bundle gets DesktopLayer.native.tsx, a no-op). Nothing here is reachable from the Android game.

import { input } from '../systems/InputSystem';
import { useStore } from '../state/store';
import { backStack } from './backHandler';
import { EdgeTracker, NavRepeater, emptyFrame, frameFrom, type Command, type Mode, type PadSnapshot } from './actions';
import { pickInitial, pickNext, type Dir, type Rect } from './focusNav';
import { DeviceTracker, nextStyle, padFamily, resolveFamily, type PromptStyle } from './prompts';
import type { Family } from './glyphManifest';

export type RuntimeState = {
  mode: Mode;
  family: Family;
  style: PromptStyle;
  padName: string | null;
  deck: boolean;
  visible: boolean;
};

const STORE_KEY = 'endless-escaspe:desktop:v1'; // device-local preferences; never part of a save or a cloud sync
const QUIT_HOLD_MS = 2000;
const HIDE_AFTER_MS = 9000;

// `window` / `document` / `navigator` are the browser's; typed loosely because this repo targets React Native.
const w = globalThis as unknown as {
  window: any;
  document: any;
  navigator: any;
  localStorage?: any;
  requestAnimationFrame: (cb: (t: number) => void) => number;
  cancelAnimationFrame: (id: number) => void;
};

export function currentMode(): Mode {
  const st = useStore.getState();
  return st.runState === 'playing' && !st.paused && !st.gameModal && !st.showTutorial && st.howToPlay == null ? 'play' : 'menu';
}

function readStyle(): PromptStyle {
  try {
    const v = JSON.parse(w.localStorage?.getItem(STORE_KEY) ?? 'null')?.promptStyle;
    return ['auto', 'xbox', 'playstation', 'switch', 'keyboard'].includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}
function writeStyle(style: PromptStyle) {
  try {
    w.localStorage?.setItem(STORE_KEY, JSON.stringify({ promptStyle: style }));
  } catch {
    /* preference only */
  }
}

const FOCUS_ATTR = 'data-ee-focus';
const FOCUSABLE = '[tabindex="0"],button,[role="button"],a[href],input,textarea,select';

function visibleCandidates(): Array<{ el: any; rect: Rect }> {
  const doc = w.document;
  const out: Array<{ el: any; rect: Rect }> = [];
  for (const el of Array.from(doc.querySelectorAll(FOCUSABLE)) as any[]) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > w.window.innerHeight || r.left > w.window.innerWidth) continue;
    const cs = w.window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    // Occlusion: only elements actually on top at their centre (a screen drawn over another hides it).
    const top = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(el === top || el.contains(top) || top.contains(el))) continue;
    out.push({ el, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
  }
  // Drop a focusable that merely wraps another one.
  return out.filter((a) => !out.some((b) => b !== a && a.el.contains(b.el)));
}

function setFocus(el: any) {
  const doc = w.document;
  for (const old of Array.from(doc.querySelectorAll(`[${FOCUS_ATTR}]`)) as any[]) old.removeAttribute(FOCUS_ATTR);
  if (!el) return;
  el.setAttribute(FOCUS_ATTR, '1');
  el.focus?.({ preventScroll: true });
}

function moveFocus(dir: Dir) {
  const cands = visibleCandidates();
  if (cands.length === 0) return;
  const active = w.document.activeElement;
  const cur = cands.find((c) => c.el === active || c.el.getAttribute(FOCUS_ATTR) === '1');
  // A focused slider consumes left / right as value changes (delivered as the arrow keys the control listens for).
  const focusedEl = cur?.el;
  if (focusedEl && focusedEl.getAttribute('role') === 'slider' && (dir === 'left' || dir === 'right')) {
    focusedEl.dispatchEvent(new (w.window as any).KeyboardEvent('keydown', { key: dir === 'left' ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true }));
    return;
  }
  let idx = -1;
  if (!cur) idx = pickInitial(cands.map((c) => c.rect), { width: w.window.innerWidth, height: w.window.innerHeight });
  else idx = pickNext(cur.rect, cands.map((c) => c.rect), dir);
  if (idx >= 0) setFocus(cands[idx]!.el);
}

function activateFocus() {
  const el = w.document.querySelector(`[${FOCUS_ATTR}="1"]`) ?? w.document.activeElement;
  if (!el || el === w.document.body) {
    moveFocus('down'); // nothing focused yet: first press selects the starting element
    return;
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
  el.click();
}

function injectStyle() {
  const doc = w.document;
  if (doc.getElementById('ee-desktop-style')) return;
  const style = doc.createElement('style');
  style.id = 'ee-desktop-style';
  style.textContent = `[${FOCUS_ATTR}="1"]{outline:3px solid #ffd14a !important;outline-offset:3px;border-radius:14px}`;
  doc.head.appendChild(style);
}

// Android closes a Modal with the back button (Modal.onRequestClose). react-native-web delivers that as an
// Escape keyup on the document, so a back press nobody consumed becomes exactly that.
function dismissModal() {
  const target = w.document.querySelector(`[${FOCUS_ATTR}="1"]`) ?? w.document.activeElement ?? w.document.body;
  const ev = new (w.window as any).KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
}

export function startDesktopRuntime(onState: (s: RuntimeState) => void): () => void {
  if (!w.window || !w.document) return () => undefined;
  injectStyle();

  const keys = new Set<string>();
  const edges = new EdgeTracker();
  const nav = new NavRepeater();
  const device = new DeviceTracker();
  let style: PromptStyle = readStyle();
  let pad: PadSnapshot | null = null;
  let padId: string | null = null;
  let ownsAxes = false;
  let ownsLook = false;
  let ownsRun = false;
  let lastMode: Mode = currentMode();
  let lastActivity = -Infinity;
  let quitSince: number | null = null;
  let quitFired = false;
  let raf = 0;
  let unfocused = false; // window lost focus: ignore held input until focus returns
  let lastPublished = '';

  const toast = (text: string) => useStore.getState().showToast(text, 'info');

  const setRun = (on: boolean) => {
    input.run = on;
    useStore.getState().setRunning(on);
  };
  const releaseContinuous = () => {
    if (ownsAxes) {
      input.axisX = 0;
      input.axisY = 0;
      ownsAxes = false;
    }
    if (ownsLook) {
      input.viewYaw = 0;
      ownsLook = false;
    }
    if (ownsRun) {
      setRun(false);
      ownsRun = false;
    }
  };
  const releaseAll = () => {
    keys.clear();
    edges.reset();
    nav.reset();
    quitSince = null;
    releaseContinuous();
  };

  const publish = (now: number) => {
    const family = resolveFamily(style, device.current, padId ? padFamily(padId).family : null);
    const mode = currentMode();
    const visible = device.current !== null && (mode === 'menu' || now - lastActivity < HIDE_AFTER_MS);
    const s: RuntimeState = { mode, family, style, padName: padId, deck: padId ? padFamily(padId).deck : false, visible };
    const sig = JSON.stringify(s);
    if (sig !== lastPublished) {
      lastPublished = sig;
      onState(s);
    }
  };

  const runCommand = (c: Command, mode: Mode) => {
    const st = useStore.getState();
    if (mode === 'play') {
      if (c === 'runToggle') setRun(!st.running);
      else if (c === 'stance') {
        const next = st.stance === 'crouch' ? 'walk' : 'crouch';
        input.stance = next;
        st.setStance(next);
      } else if (c === 'crowbar') {
        if (st.inventory.crowbar > 0) input.useCrowbar = true;
      } else if (c === 'smoke') {
        if (st.inventory.smokebomb > 0) input.useSmokeBomb = true;
      } else if (c === 'rock') {
        if (st.inventory.rock > 0) input.throwRock = true;
      } else if (c === 'pause') {
        // Same entry point as the on-screen gear: opens Settings, which pauses the run.
        (w.document.querySelector('[aria-label="Settings"]') as any)?.click?.();
      }
      return;
    }
    if (c === 'confirm') activateFocus();
    else if (c === 'back') {
      if (!backStack.press()) dismissModal();
    }
    else if (c === 'navUp') moveFocus('up');
    else if (c === 'navDown') moveFocus('down');
    else if (c === 'navLeft') moveFocus('left');
    else if (c === 'navRight') moveFocus('right');
  };

  const tick = (t: number) => {
    raf = w.requestAnimationFrame(tick);
    // ---- poll the first connected pad
    const pads: any[] = Array.from(w.navigator.getGamepads?.() ?? []).filter((g: any) => g && g.connected);
    const g = pads.find((x) => x.mapping === 'standard') ?? pads[0] ?? null;
    if (g) {
      pad = { axes: Array.from(g.axes as ArrayLike<number>), buttons: Array.from(g.buttons as ArrayLike<{ pressed: boolean }>).map((b) => b.pressed) };
      if (padId !== g.id) padId = g.id;
    } else {
      pad = null;
    }
    const mode = currentMode();
    if (mode !== lastMode) {
      releaseContinuous(); // a screen opened or closed: nothing may keep moving the player
      edges.reset();
      nav.reset();
      if (mode === 'play') setFocus(null);
      lastMode = mode;
    }
    const f = !unfocused && (pad || keys.size) ? frameFrom(mode, keys, pad) : emptyFrame();
    if (f.padActive && device.note('pad', t)) lastActivity = t;
    if (f.keyboardActive && device.note('keyboard', t)) lastActivity = t;
    if (f.padActive || f.keyboardActive) lastActivity = t;

    if (mode === 'play') {
      const moving = f.move.x !== 0 || f.move.y !== 0;
      if (moving) {
        input.axisX = f.move.x;
        input.axisY = f.move.y;
        ownsAxes = true;
      } else if (ownsAxes) {
        input.axisX = 0;
        input.axisY = 0;
        ownsAxes = false;
      }
      if (f.lookYaw !== 0) {
        input.viewYaw = f.lookYaw;
        ownsLook = true;
      } else if (ownsLook) {
        input.viewYaw = 0;
        ownsLook = false;
      }
      if (f.runHeld && !ownsRun) {
        setRun(true);
        ownsRun = true;
      } else if (!f.runHeld && ownsRun) {
        setRun(false);
        ownsRun = false;
      }
      for (const c of edges.step(f.held)) runCommand(c, mode);
    } else {
      const press = edges.step(f.held);
      for (const c of press) if (c === 'confirm' || c === 'back') runCommand(c, mode);
      const navCmd = nav.step(f.held, t);
      if (navCmd) runCommand(navCmd, mode);
    }

    // Hold Back / View to quit (desktop exit without a mouse). The Electron shell provides window.desktop.
    if (f.quitHeld) {
      if (quitSince === null) {
        quitSince = t;
        quitFired = false;
        toast('Hold to quit');
      } else if (!quitFired && t - quitSince >= QUIT_HOLD_MS) {
        quitFired = true;
        w.window.desktop?.quit?.();
      }
    } else {
      quitSince = null;
    }
    publish(t);
  };

  const onKeyDown = (e: any) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return; // leave OS / shell shortcuts (Ctrl+Q, Alt+Enter, F11) alone
    if (e.code === 'F2') {
      style = nextStyle(style);
      writeStyle(style);
      e.preventDefault();
      return;
    }
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
    if (typing && e.code !== 'Escape') return;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  const onKeyUp = (e: any) => {
    keys.delete(e.code);
  };
  const onBlur = () => {
    unfocused = true;
    releaseAll();
  };
  const onFocus = () => {
    unfocused = false;
  };
  const onVisibility = () => {
    if (w.document.visibilityState === 'hidden') onBlur();
    else onFocus();
  };
  const onPadConnected = (e: any) => {
    const id: string = e?.gamepad?.id ?? 'Controller';
    toast(`Controller connected: ${padFamily(id).deck ? 'Steam Deck' : id.split('(')[0].trim()}`);
  };
  const onPadDisconnected = () => {
    releaseAll(); // no stuck movement when the controller goes away
    toast('Controller disconnected');
  };

  w.window.addEventListener('keydown', onKeyDown);
  w.window.addEventListener('keyup', onKeyUp);
  w.window.addEventListener('blur', onBlur);
  w.window.addEventListener('focus', onFocus);
  w.window.addEventListener('pagehide', onBlur);
  w.document.addEventListener('visibilitychange', onVisibility);
  w.window.addEventListener('gamepadconnected', onPadConnected);
  w.window.addEventListener('gamepaddisconnected', onPadDisconnected);
  raf = w.requestAnimationFrame(tick);

  // The prompt chip in the overlay asks for a style change through this hook.
  (w.window as any).__eeCyclePromptStyle = () => {
    style = nextStyle(style);
    writeStyle(style);
  };

  return () => {
    w.cancelAnimationFrame(raf);
    releaseAll();
    w.window.removeEventListener('keydown', onKeyDown);
    w.window.removeEventListener('keyup', onKeyUp);
    w.window.removeEventListener('blur', onBlur);
    w.window.removeEventListener('focus', onFocus);
    w.window.removeEventListener('pagehide', onBlur);
    w.document.removeEventListener('visibilitychange', onVisibility);
    w.window.removeEventListener('gamepadconnected', onPadConnected);
    w.window.removeEventListener('gamepaddisconnected', onPadDisconnected);
  };
}
