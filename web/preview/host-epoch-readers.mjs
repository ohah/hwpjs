// Shared host descriptor boundary. A token is a host contract, never Native authority.
export const HOST_EPOCH_KEYS = Object.freeze(['geometryMeasurementEpoch', 'resourceProviderEpoch']);
export function createHostEpochReaders(environment) {
  return Object.fromEntries(
    HOST_EPOCH_KEYS.map((key) => {
      let captured;
      try {
        captured = Object.getOwnPropertyDescriptor(environment, key);
      } catch {
        return [key, () => null];
      }
      const read = () => {
        if (!captured) return undefined;
        try {
          const current = Object.getOwnPropertyDescriptor(environment, key);
          if (
            !Object.hasOwn(captured, 'value') ||
            !current ||
            !Object.hasOwn(current, 'value') ||
            typeof captured.value !== 'function' ||
            ['value', 'writable', 'configurable', 'enumerable'].some(
              (k) => current[k] !== captured[k],
            )
          )
            return null;
          return Reflect.apply(captured.value, environment, []);
        } catch {
          return null;
        }
      };
      return [key, read];
    }),
  );
}
