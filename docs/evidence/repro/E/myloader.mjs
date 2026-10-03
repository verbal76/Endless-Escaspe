import { pathToFileURL } from 'node:url';
import * as base from '/home/user/Endless-Escaspe/tests/loader.mjs';
export async function resolve(spec, ctx, next) {
  if (spec === 'expo-audio') return { url: pathToFileURL(process.cwd() + '/audiostub.mjs').href, shortCircuit: true };
  if (spec.endsWith('.mp3')) return { url: 'data:text/javascript,export default 1', shortCircuit: true };
  return base.resolve(spec, ctx, next);
}
