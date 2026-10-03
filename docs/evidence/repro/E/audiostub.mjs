export const created = [];
export function createAudioPlayer(src) {
  const p = { src, volume: 0, rate: 1, playing: false, loop: false, listeners: [], writes: 0,
    play() { this.playing = true; }, pause() { this.playing = false; }, seekTo() {}, remove() {},
    setPlaybackRate(r) { this.rate = r; },
    addListener(n, f) { this.listeners.push(f); return { remove() {} }; } };
  let v = 0; Object.defineProperty(p, 'volume', { get: () => v, set: (x) => { v = x; p.writes++; } });
  created.push(p); return p;
}
export async function setAudioModeAsync() {}
