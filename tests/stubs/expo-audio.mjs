export function createAudioPlayer() {
  return { play() {}, pause() {}, seekTo() {}, remove() {}, volume: 0, loop: false, addListener() { return { remove() {} }; } };
}
export async function setAudioModeAsync() {}
