export const Asset = {
  fromModule() {
    return { downloadAsync: async () => { throw new Error('no assets in tests'); } };
  },
};
