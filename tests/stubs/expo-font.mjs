// Tests set globalThis.__fontStub = { fail?: string, registered?: boolean }.
const loaded = new Set();
export async function loadAsync(map) {
  const s = globalThis.__fontStub ?? {};
  if (s.fail) throw new Error(s.fail);
  if (s.registered !== false) for (const k of Object.keys(map)) loaded.add(k);
}
export function isLoaded(name) {
  return loaded.has(name);
}
