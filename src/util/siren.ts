// Procedural siren: synthesise a small WAV file in JS, encode it as
// a base64 data URI, and feed it to expo-audio's createAudioPlayer.
//
// Why: shipping a real audio asset would need the asset pipeline
// (require('./siren.mp3') + bundling). Synthesising in JS avoids
// that entirely - a ~1.4s WAV at 11025 Hz mono 16-bit PCM is small
// enough (~30KB base64) to embed inline and produces a recognisable
// two-tone siren via a sinusoidal frequency sweep.
//
// The buffer loops, so it must close on itself: the sweep spans
// exactly one period of the buffer, and the oscillator's per-sample
// phase increment is scaled so the buffer holds a whole number of
// cycles (otherwise the wrap is a phase jump = a click every loop).
// Tone: a sine with a soft second harmonic and a lower peak level -
// less piercing than the bare sine, still clearly a siren.

const SAMPLE_RATE = 11025;
const DURATION_S = 1.4;
const FREQ_LOW = 560;
const FREQ_HIGH = 860;
const AMPLITUDE = 13000;
const HARMONIC_2 = 0.18;

export const SIREN_SAMPLE_RATE = SAMPLE_RATE;

// Raw 16-bit samples of one loop of the siren.
export function buildSirenPcm(): Int16Array {
  const n = Math.round(SAMPLE_RATE * DURATION_S);
  const freqAt = (i: number) => {
    const sweep = Math.sin((i / n) * 2 * Math.PI);
    return (FREQ_LOW + FREQ_HIGH) / 2 + (sweep * (FREQ_HIGH - FREQ_LOW)) / 2;
  };
  // Total cycles over one loop, then the correction that makes it whole.
  let cycles = 0;
  for (let i = 0; i < n; i++) cycles += freqAt(i) / SAMPLE_RATE;
  const k = Math.round(cycles) / cycles;
  const peak = 1 + HARMONIC_2;
  const out = new Int16Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.sin(phase) + HARMONIC_2 * Math.sin(2 * phase);
    out[i] = Math.round((v / peak) * AMPLITUDE);
    phase += (2 * Math.PI * freqAt(i) * k) / SAMPLE_RATE;
  }
  return out;
}

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64_CHARS[a >> 2];
    out += B64_CHARS[((a & 3) << 4) | (b >> 4)];
    out += B64_CHARS[((b & 15) << 2) | (c >> 6)];
    out += B64_CHARS[c & 63];
  }
  if (i < len) {
    const a = bytes[i];
    if (i + 1 < len) {
      const b = bytes[i + 1];
      out += B64_CHARS[a >> 2];
      out += B64_CHARS[((a & 3) << 4) | (b >> 4)];
      out += B64_CHARS[(b & 15) << 2];
      out += '=';
    } else {
      out += B64_CHARS[a >> 2];
      out += B64_CHARS[(a & 3) << 4];
      out += '==';
    }
  }
  return out;
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

let cachedUri: string | null = null;

export function getSirenDataUri(): string {
  if (cachedUri) return cachedUri;

  const pcm = buildSirenPcm();
  const numSamples = pcm.length;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) view.setInt16(44 + i * 2, pcm[i], true);

  cachedUri = 'data:audio/wav;base64,' + bytesToBase64(new Uint8Array(buf));
  return cachedUri;
}
