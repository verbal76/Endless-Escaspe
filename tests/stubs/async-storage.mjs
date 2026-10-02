// In-memory AsyncStorage for unit tests. The `__` helpers let storage
// tests reset state and inject failures (e.g. a full disk on setItem).
const mem = new Map();
let failRule = null; // (op, key) => boolean

function check(op, k) {
  if (failRule && failRule(op, k)) throw new Error(`stub ${op} failed for ${k}`);
}

export default {
  async getItem(k) { check('getItem', k); return mem.has(k) ? mem.get(k) : null; },
  async setItem(k, v) { check('setItem', k); mem.set(k, v); },
  async removeItem(k) { check('removeItem', k); mem.delete(k); },
  __reset() { mem.clear(); failRule = null; },
  __setFailRule(fn) { failRule = fn; },
  __dump() { return Object.fromEntries(mem); },
};
