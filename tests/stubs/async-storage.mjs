const mem = new Map();
export default {
  async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
  async setItem(k, v) { mem.set(k, v); },
  async removeItem(k) { mem.delete(k); },
};
