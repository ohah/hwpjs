/** Own optional SDK method captured once for one synchronous collection. */
export function createObservationReadScope(sdk: object) {
  const scope = Object.hasOwn(sdk, 'withReadObservations')
    ? Reflect.get(sdk, 'withReadObservations')
    : undefined;
  return function observe<T extends object>(section: number, read: () => T): T {
    if (typeof scope !== 'function') return read();
    let invoked = false;
    let completed = false;
    let observed: T | undefined;
    const value: unknown = Reflect.apply(scope, sdk, [
      section,
      () => {
        if (invoked) throw new Error('DuplicateReadObservationCallback');
        invoked = true;
        observed = read();
        completed = true;
        return observed;
      },
    ]);
    if (!completed || observed === undefined || value !== observed)
      throw new Error('InvalidReadObservationScopeResult');
    return observed;
  };
}
