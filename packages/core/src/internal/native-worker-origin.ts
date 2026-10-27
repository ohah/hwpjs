/** Internal transport witness. Unknown platform customization keeps the ordinary runtime path. */
export function createNativeWorkerWitness() {
  const host = globalThis as unknown as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(host, 'Worker');
  const Constructor = descriptor && 'value' in descriptor ? descriptor.value : undefined;
  const native = (value: unknown, name: string) =>
    typeof value === 'function' &&
    Function.prototype.toString.call(value) === `function ${name}() { [native code] }`;
  const prototype = typeof Constructor === 'function' ? Constructor.prototype : undefined;
  const post = prototype && Object.getOwnPropertyDescriptor(prototype, 'postMessage');
  const terminate = prototype && Object.getOwnPropertyDescriptor(prototype, 'terminate');
  let trusted: ((this: unknown) => unknown) | undefined;
  let data: ((this: unknown) => unknown) | undefined;
  try {
    const EventConstructor = globalThis.MessageEvent;
    if (typeof EventConstructor === 'function') {
      trusted = Object.getOwnPropertyDescriptor(new EventConstructor('message'), 'isTrusted')?.get;
      data = Object.getOwnPropertyDescriptor(EventConstructor.prototype, 'data')?.get;
    }
  } catch {
    /* Unavailable platform accessors cannot establish authority. */
  }
  const supported =
    native(Constructor, 'Worker') &&
    native(post?.value, 'postMessage') &&
    native(terminate?.value, 'terminate') &&
    native(trusted, 'get isTrusted') &&
    native(data, 'get data');
  const current = (worker: object | undefined) => {
    try {
      const now = Object.getOwnPropertyDescriptor(host, 'Worker');
      const currentPost = Object.getOwnPropertyDescriptor(prototype, 'postMessage');
      const currentTerminate = Object.getOwnPropertyDescriptor(prototype, 'terminate');
      return (
        supported &&
        !!worker &&
        !!now &&
        'value' in now &&
        now.value === Constructor &&
        Object.getPrototypeOf(worker) === prototype &&
        currentPost?.value === post?.value &&
        currentTerminate?.value === terminate?.value &&
        !Object.hasOwn(worker, 'postMessage') &&
        !Object.hasOwn(worker, 'terminate')
      );
    } catch {
      return false;
    }
  };
  return Object.freeze({
    current,
    accepts(event: unknown, value: unknown): boolean {
      try {
        return supported && trusted!.call(event) === true && data!.call(event) === value;
      } catch {
        return false;
      }
    },
  });
}
