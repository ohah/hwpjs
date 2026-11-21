import {
  ownObjectGeometryRecord,
  checkedObjectGeometrySelector,
  checkedObjectGeometryOwner,
  checkedObjectGeometryFrame,
  checkedObjectGeometryObservation,
} from './object-geometry-edit.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const invalid = () => {
  throw Error('InvalidObjectOuterMargins');
};
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const scoped = new RegExp('^outer-margins:' + uuid + ':', 'i');
export function checkedObjectOuterMargins(value) {
  const margins = ownObjectGeometryRecord(value, ['left', 'right', 'top', 'bottom']);
  if (
    Object.values(margins).some(
      (v) => !Number.isSafeInteger(v) || Object.is(v, -0) || v < 0 || v > 32767,
    )
  )
    invalid();
  return Object.freeze(margins);
}
function binding(value) {
  const b = ownObjectGeometryRecord(value, ['session', 'serial']);
  if (
    typeof b.session !== 'string' ||
    !/^[A-Za-z0-9:._-]{1,512}$/.test(b.session) ||
    typeof b.serial !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(b.serial) ||
    (b.serial.length === 20 && b.serial > '18446744073709551615')
  )
    invalid();
  const raw = b.session.replace(scoped, '');
  if (raw.length < 2 || raw.length > 256) invalid();
  return Object.freeze(b);
}
export function checkedObjectOuterMarginsObservation(value) {
  const p = ownObjectGeometryRecord(
    value,
    ['geometry', 'margins', 'verticalOnly'],
    ['geometry', 'margins'],
  );
  if (Object.hasOwn(p, 'verticalOnly') && p.verticalOnly !== true) invalid();
  const g = ownObjectGeometryRecord(p.geometry, [
    'format',
    'selector',
    'owner',
    'frame',
    'editable',
    'reason',
    'historyRevision',
    'binding',
  ]);
  const b = binding(g.binding);
  const raw = checkedObjectGeometryObservation({
    ...g,
    binding: { ...b, session: b.session.replace(scoped, '') },
  });
  if (
    raw.format !== 'hwpx' ||
    raw.selector.kind !== 'drawing' ||
    raw.frame.treatAsCharacter ||
    !raw.editable.position
  )
    invalid();
  return Object.freeze({
    geometry: Object.freeze({ ...raw, binding: b }),
    margins: checkedObjectOuterMargins(p.margins),
    ...(p.verticalOnly === true ? { verticalOnly: true } : {}),
  });
}
export function checkedObjectOuterMarginsRequest(value) {
  const p = ownObjectGeometryRecord(value, ['geometry', 'expectedMargins', 'margins']);
  const g = ownObjectGeometryRecord(p.geometry, [
    'selector',
    'owner',
    'expected',
    'historyRevision',
    'binding',
    'patch',
  ]);
  const selector = checkedObjectGeometrySelector(g.selector),
    expected = checkedObjectGeometryFrame(g.expected);
  if (
    selector.kind !== 'drawing' ||
    expected.treatAsCharacter ||
    !Number.isSafeInteger(g.historyRevision) ||
    Object.is(g.historyRevision, -0) ||
    g.historyRevision < 0
  )
    invalid();
  ownObjectGeometryRecord(g.patch, []);
  return Object.freeze({
    geometry: Object.freeze({
      selector,
      owner: checkedObjectGeometryOwner(g.owner),
      expected,
      historyRevision: g.historyRevision,
      binding: binding(g.binding),
      patch: Object.freeze({}),
    }),
    expectedMargins: checkedObjectOuterMargins(p.expectedMargins),
    margins: checkedObjectOuterMargins(p.margins),
  });
}
export function createObjectOuterMarginsApi({ wasm, memory, check }) {
  let scope;
  try {
    const nonce = globalThis.crypto?.randomUUID?.();
    if (typeof nonce === 'string' && new RegExp('^' + uuid + '$', 'i').test(nonce))
      scope = 'outer-margins:' + nonce + ':';
  } catch {
    /* Optional scope stays unavailable. */
  }
  const version = 'hwpx_edit_object_outer_margins_version';
  const read = 'hwpx_edit_object_outer_margins';
  const write = 'hwpx_edit_set_object_outer_margins';
  function supportsObjectOuterMargins() {
    check();
    return (
      typeof scope === 'string' &&
      [version, read, write].every((n) => typeof wasm[n] === 'function') &&
      wasm[version]() === 1
    );
  }
  function requireSupported() {
    if (!supportsObjectOuterMargins()) throw Error('ObjectOuterMarginsAbiUnavailable');
  }
  return {
    supportsObjectOuterMargins,
    objectOuterMargins(value) {
      check();
      requireSupported();
      const selector = checkedObjectGeometrySelector(value);
      if (selector.kind !== 'drawing') invalid();
      let observation;
      try {
        if (wasm[read](selector.section, selector.node) !== 1) throw memory.error();
        const size = wasm.hwpx_edit_output_len();
        if (!Number.isSafeInteger(size) || size <= 0 || size > 16384) invalid();
        observation = checkedObjectOuterMarginsObservation(
          JSON.parse(utf8.decode(memory.copy(wasm.hwpx_edit_output_ptr(), size))),
        );
      } finally {
        wasm.hwpx_edit_output_free();
      }
      const g = observation.geometry;
      if (
        g.selector.section !== selector.section ||
        g.selector.node !== selector.node ||
        scoped.test(g.binding.session)
      )
        throw Error('ObjectOuterMarginsBindingMismatch');
      return checkedObjectOuterMarginsObservation({
        ...observation,
        geometry: { ...g, binding: { ...g.binding, session: scope + g.binding.session } },
      });
    },
    setObjectOuterMargins(value) {
      check();
      requireSupported();
      const request = checkedObjectOuterMarginsRequest(value),
        b = request.geometry.binding;
      if (!b.session.startsWith(scope)) throw Error('ForeignObjectOuterMarginsOwner');
      const bytes = encoder.encode(
        JSON.stringify({
          ...request,
          geometry: {
            ...request.geometry,
            binding: { ...b, session: b.session.slice(scope.length) },
          },
        }),
      );
      if (bytes.length > 16384) invalid();
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, len) => wasm[write](ptr, len),
        'InvalidObjectOuterMarginsResult',
      );
    },
  };
}
