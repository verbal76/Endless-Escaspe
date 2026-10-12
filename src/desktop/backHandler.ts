// react-native-web has no BackHandler (it only logs an error). Every screen of this game registers
// 'hardwareBackPress' handlers (Settings, About, How to Play, Tutorial, title screen), so on desktop this
// module supplies the real Android semantics: the most recently registered handler runs first and the
// first one that returns true consumes the press. Installed once, before any screen mounts, by DesktopLayer.

type Handler = () => boolean | null | undefined;

export class BackStack {
  private readonly handlers: Handler[] = [];
  add(h: Handler): { remove: () => void } {
    this.handlers.push(h);
    return { remove: () => this.remove(h) };
  }
  remove(h: Handler): void {
    const i = this.handlers.lastIndexOf(h);
    if (i >= 0) this.handlers.splice(i, 1);
  }
  /** Run handlers newest first; true when one consumed the press. */
  press(): boolean {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i]!()) return true;
    }
    return false;
  }
  get size(): number {
    return this.handlers.length;
  }
}

export const backStack = new BackStack();

type BackHandlerLike = {
  addEventListener: (name: string, h: Handler) => { remove: () => void };
  removeEventListener?: (name: string, h: Handler) => void;
};

/** Replace react-native-web's no-op BackHandler with the stack above. Idempotent. */
export function installBackHandler(target: BackHandlerLike): void {
  if ((target as { __eeDesktop?: boolean }).__eeDesktop) return;
  (target as { __eeDesktop?: boolean }).__eeDesktop = true;
  target.addEventListener = (name, h) => (name === 'hardwareBackPress' ? backStack.add(h) : { remove: () => undefined });
  target.removeEventListener = (name, h) => {
    if (name === 'hardwareBackPress') backStack.remove(h);
  };
}
