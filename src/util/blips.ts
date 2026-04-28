// Short procedural blip / whoosh tones for pickup events. Same trick
// as util/siren.ts: synthesise a tiny WAV in JS and encode it as a
// base64 data URI so we don't ship audio assets through the bundler.
//
// Each generator returns a cached data URI; cost is paid once at first
// access. Tones are mono, 11025 Hz, 16-bit PCM.

const SAMPLE_RATE = 11025;

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

// Build a mono PCM WAV with the supplied sample-generator function.
// `sample(t, totalT)` returns a value in [-1, 1] for each sample;
// the writer scales to int16.
function buildWavUri(durationS: number, sample: (t: number, total: number) => number): string {
  const numSamples = Math.floor(SAMPLE_RATE * durationS);
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

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const v = sample(t, durationS);
    const clipped = v < -1 ? -1 : v > 1 ? 1 : v;
    view.setInt16(44 + i * 2, Math.round(clipped * 28000), true);
  }

  return 'data:audio/wav;base64,' + bytesToBase64(new Uint8Array(buf));
}

// Quick attack-decay envelope. Attack ramps up over the first 4ms;
// decay falls to 0 over the remaining duration. Avoids click pops
// that plain on/off windows produce.
function envelope(t: number, total: number): number {
  const attack = 0.004;
  if (t < attack) return t / attack;
  return Math.max(0, 1 - (t - attack) / (total - attack));
}

let cachedGrab: string | null = null;
let cachedUse: string | null = null;

// Pickup grab: short upward chirp from ~720Hz to ~1200Hz over 130ms.
// Reads as a positive "got it" blip without being shrill.
export function getPickupGrabUri(): string {
  if (cachedGrab) return cachedGrab;
  const dur = 0.13;
  let phase = 0;
  cachedGrab = buildWavUri(dur, (t) => {
    const freq = 720 + (1200 - 720) * (t / dur);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    return Math.sin(phase) * envelope(t, dur);
  });
  return cachedGrab;
}

// Pickup use: lower, slightly longer downward sweep from ~620Hz to
// ~280Hz over 220ms. Reads as a "deploy" / "swing" thump.
export function getPickupUseUri(): string {
  if (cachedUse) return cachedUse;
  const dur = 0.22;
  let phase = 0;
  cachedUse = buildWavUri(dur, (t) => {
    const freq = 620 - (620 - 280) * (t / dur);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    return Math.sin(phase) * envelope(t, dur);
  });
  return cachedUse;
}
