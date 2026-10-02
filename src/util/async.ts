// Resolves with the promise's value, or 'timeout' if it takes longer
// than `ms`; rejects if the promise rejects. Used to keep app boot from
// hanging on any one step.
export function boundedStep<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
