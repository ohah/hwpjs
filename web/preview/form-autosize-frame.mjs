const stores = new WeakSet();
// Derived frame receipt only. No font/height formula, Native value model or edit permission.
const finiteSize = (v) =>
  v && Number.isFinite(v.width) && v.width > 0 && Number.isFinite(v.height) && v.height > 0;
const signature = (v) => {
  if (
    !v ||
    typeof v.label !== 'string' ||
    v.label.length > 65535 ||
    !v.label.isWellFormed() ||
    (v.name !== undefined &&
      v.name !== null &&
      (typeof v.name !== 'string' || v.name.length > 65535 || !v.name.isWellFormed())) ||
    typeof v.font !== 'string' ||
    !v.font ||
    v.font.length > 4096 ||
    !finiteSize(v.storedFrame) ||
    (v.lineHeight !== null && (!Number.isFinite(v.lineHeight) || v.lineHeight <= 0)) ||
    typeof v.multiline !== 'boolean' ||
    typeof v.wordWrap !== 'boolean' ||
    typeof v.kind !== 'string'
  )
    throw Error('InvalidFormAutoSizeContext');
  return JSON.stringify([
    v.kind,
    v.label,
    v.font,
    v.multiline,
    v.wordWrap,
    v.storedFrame.width,
    v.storedFrame.height,
    v.lineHeight,
    v.name ?? null,
    v.fontHeight ?? null,
  ]);
};
/** Private measurement lifecycle. The caller must obtain current authoritative geometry.
 * A receipt verifies binding/lifetime/units; it does not certify an arbitrary sizer's accuracy.
 * The renderer supplies its documented content-fit policy; official pixel equivalence is separate.
 */
export function createFormAutoSizeFrames() {
  let snapshot = null,
    owners = new Set(),
    frames = new Map(),
    pending = new Map(),
    epoch = 0,
    live = true;
  let tickets = new WeakMap();
  const matches = (source, owner) => live && source === snapshot && owners.has(owner);
  const store = Object.freeze({
    admits(source, owner) {
      return matches(source, owner);
    },
    begin(source, currentOwners) {
      if (!live) throw Error('DisposedFormAutoSizeFrames');
      if (
        !source ||
        typeof source !== 'object' ||
        !Array.isArray(currentOwners) ||
        currentOwners.length > 100000 ||
        currentOwners.some((v) => !v || typeof v !== 'object') ||
        new Set(currentOwners).size !== currentOwners.length
      )
        throw Error('InvalidFormAutoSizeOwners');
      snapshot = source;
      owners = new Set(currentOwners);
      frames = new Map();
      pending = new Map();
      tickets = new WeakMap();
      epoch++;
    },
    issue(source, owner, context) {
      if (!matches(source, owner)) throw Error('StaleFormAutoSizeOwner');
      const key = signature(context),
        ticket = Object.freeze({});
      tickets.set(ticket, { source, owner, key, epoch });
      pending.set(owner, ticket);
      frames.delete(owner);
      return ticket;
    },
    request(source, owner, context, run) {
      const ready = store.resolve(source, owner, context);
      if (ready || typeof run !== 'function' || !matches(source, owner)) return ready;
      const key = signature(context),
        previous = tickets.get(pending.get(owner));
      if (previous?.epoch === epoch && previous.key === key) return null;
      const ticket = store.issue(source, owner, context);
      try {
        run(
          Object.freeze({ ticket, context, commit: (observed) => store.commit(ticket, observed) }),
        );
      } catch (error) {
        if (pending.get(owner) === ticket) pending.delete(owner);
        tickets.delete(ticket);
        throw error;
      }
      return store.resolve(source, owner, context);
    },
    commit(ticket, observed) {
      const binding = tickets.get(ticket);
      if (
        !binding ||
        !matches(binding.source, binding.owner) ||
        binding.epoch !== epoch ||
        pending.get(binding.owner) !== ticket
      )
        throw Error('StaleFormAutoSizeMeasurement');
      const size = {
        width: observed?.width,
        height: observed?.height,
        units: observed?.units,
        scale: observed?.scale,
        lineHeight: observed?.lineHeight,
        textOffset: observed?.textOffset,
      };
      if (
        !finiteSize(size) ||
        size.units !== 'document-css-px' ||
        size.scale !== 1 ||
        (size.lineHeight !== undefined &&
          (!Number.isFinite(size.lineHeight) || size.lineHeight <= 0)) ||
        (size.textOffset !== undefined &&
          (!Number.isFinite(size.textOffset) || size.textOffset < 0))
      )
        throw Error('InvalidFormAutoSizeMeasurement');
      // Observed fields may be getters. Revalidate after consuming them so a
      // reentrant begin/dispose/supersession cannot publish into a newer epoch.
      if (
        !matches(binding.source, binding.owner) ||
        binding.epoch !== epoch ||
        pending.get(binding.owner) !== ticket
      )
        throw Error('StaleFormAutoSizeMeasurement');
      frames.set(
        binding.owner,
        Object.freeze({
          key: binding.key,
          width: size.width,
          height: size.height,
          basis: 'current-autosize-measurement',
          ...(size.lineHeight !== undefined ? { lineHeight: size.lineHeight } : {}),
          ...(size.textOffset !== undefined ? { textOffset: size.textOffset } : {}),
        }),
      );
      pending.delete(binding.owner);
      tickets.delete(ticket);
    },
    resolve(source, owner, context) {
      if (!matches(source, owner)) return null;
      const key = signature(context),
        frame = frames.get(owner);
      if (!frame || frame.key !== key) return null;
      return Object.freeze({
        width: frame.width,
        height: frame.height,
        basis: frame.basis,
        ...(frame.lineHeight !== undefined ? { lineHeight: frame.lineHeight } : {}),
        ...(frame.textOffset !== undefined ? { textOffset: frame.textOffset } : {}),
        storedFrame: Object.freeze({
          width: context.storedFrame.width,
          height: context.storedFrame.height,
        }),
      });
    },
    dispose() {
      snapshot = null;
      owners.clear();
      frames.clear();
      pending.clear();
      tickets = new WeakMap();
      epoch++;
      live = false;
    },
  });
  stores.add(store);
  return store;
}
export function resolveFormAutoSizeFrame(store, source, owner, context) {
  return stores.has(store) ? store.resolve(source, owner, context) : null;
}
export function requestFormAutoSizeFrame(store, source, owner, context, request) {
  return stores.has(store) ? store.request(source, owner, context, request) : null;
}
