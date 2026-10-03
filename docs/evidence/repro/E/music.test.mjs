globalThis.require = (p) => p;
import { created } from 'expo-audio';
const { createMusic } = await import('/home/user/Endless-Escaspe/src/scenes/Music.ts');
const { MusicIntensity } = await import('/home/user/Endless-Escaspe/src/util/musicIntensity.ts');
const { createSfx, playSfx } = await import('/home/user/Endless-Escaspe/src/scenes/Sfx.ts');
const m = createMusic(0.35);
const tension = created[2];
const mi = new MusicIntensity();
const step = (d, c, s) => { for (let i = 0; i < s * 60; i++) { const x = mi.update(d, c, 1 / 60); m.setMix(x.calmGain, x.tensionGain, x.rate); } };
const calmP = () => created.slice(0, 2).find((p) => p.playing);
step(0.6, false, 5); console.log('alert: calm', calmP().volume.toFixed(4), 'tension', tension.volume.toFixed(4));
step(1, true, 5); console.log('chase: calm', calmP().volume.toFixed(4), 'tension', tension.volume.toFixed(4), 'rate', tension.rate);
step(0, false, 15); console.log('back to calm: calm', calmP().volume.toFixed(4), 'tension residual', tension.volume.toFixed(5), 'rate', tension.rate, 'mi', mi.tensionGain, mi.rate);
// Try a few volumes for residual
for (const vol of [0.35, 0.5, 0.7, 1]) {
  m.setVolume(vol); step(1, true, 6); step(0, false, 15);
  console.log('vol', vol, 'tension residual', tension.volume.toFixed(5), 'rate residual', tension.rate.toFixed(4));
}
// slider to 0
m.setVolume(0.35); for (let v = 0.35; v >= 0; v -= 0.0071) m.setVolume(v); m.setVolume(0);
console.log('after slider->0 calm', calmP().volume.toFixed(5));
// Sfx creation count
const before = created.length; const s = createSfx(); console.log('sfx players', created.length - before);
playSfx(s, 'pickup_grab', 0.004, 1); console.log('master 0.004 plays pickup at', created.find((p) => p.writes > 0 && created.indexOf(p) >= before)?.volume);
