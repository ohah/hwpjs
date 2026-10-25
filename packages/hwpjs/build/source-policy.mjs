/** One policy for build fingerprints, declaration inputs and copied ambient declarations. */
export function isProductionSource(path) {
  return !/(?:^|[\\/])__tests__(?:[\\/]|$)/.test(path) && !/\.(?:test|spec)\./.test(path);
}
