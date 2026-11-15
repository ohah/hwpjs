// Keep DOM boolean capture removal consistent in Node and Bun test fixtures.
// Node's EventTarget removes the capture listener with the equivalent options object.
export class DomEventTarget extends EventTarget {
  removeEventListener(type, listener, options) {
    super.removeEventListener(
      type,
      listener,
      typeof options === 'boolean' ? { capture: options } : options,
    );
  }
}
