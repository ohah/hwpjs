/** This private demo host keeps its built-in editor.readResource provider unchanged after mount.
 * Rotate the provider token before any future byte/reader/decoder policy change.
 * Neither token grants Native geometry or edit authority.
 */
export function createDemoSurfaceEnvironment() {
  const measurementEpoch = Object.freeze({});
  const stableProviderEpoch = Object.freeze({});
  return Object.freeze({
    geometryMeasurementEpoch: () => measurementEpoch,
    resourceProviderEpoch: () => stableProviderEpoch,
  });
}
