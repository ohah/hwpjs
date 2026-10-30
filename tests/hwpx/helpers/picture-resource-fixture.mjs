// Detached small unit fixtures only; no Native runtime, document bytes or authority issuer.
export const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
export const bitmap = () => ({ width: 40, height: 20, close() {} });
export const tick = () => new Promise((resolve) => setImmediate(resolve));
