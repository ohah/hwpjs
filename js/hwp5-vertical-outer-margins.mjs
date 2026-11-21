import { ownObjectGeometryRecord as record } from './object-geometry-edit.mjs';
import { checkedHwp5OuterMarginsSelector } from './hwp5-object-outer-margins.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
export const HWP5_VERTICAL_MARGINS_PROFILE = 'hwp5-observed-vertical-outer-margins-v1';
const fail = () => {
  throw Error('InvalidHwp5VerticalMargins');
};
const uint = (n) => Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n <= 0xffffffff;
const word = (n) => Number.isInteger(n) && !Object.is(n, -0) && n >= -32768 && n <= 32767;
const words = (value) => {
  const v = record(value, ['lo', 'hi']);
  if (!uint(v.lo) || !uint(v.hi)) fail();
  return Object.freeze(v);
};
function digest(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== 32 ||
    Reflect.ownKeys(value).length !== 33
  )
    fail();
  const result = [];
  for (let i = 0; i < 32; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d) || !uint(d.value) || d.value > 255) fail();
    result.push(d.value);
  }
  return Object.freeze(result);
}
function witness(value) {
  const w = record(value, [
    'schemaVersion',
    'format',
    'selector',
    'owner',
    'ticket',
    'viewEpoch',
    'historyRevision',
    'margins',
    'editable',
    'reason',
    'wrapOrdinal',
    'inline',
    'ownerScope',
  ]);
  if (
    w.schemaVersion !== 1 ||
    w.format !== 'hwp5' ||
    !uint(w.historyRevision) ||
    typeof w.editable !== 'boolean' ||
    typeof w.inline !== 'boolean' ||
    !uint(w.wrapOrdinal) ||
    w.wrapOrdinal > 7 ||
    (w.reason !== null && (typeof w.reason !== 'string' || w.reason.length > 256)) ||
    typeof w.ownerScope !== 'string' ||
    !/^h5-vertical-margins:[0-9a-f-]{36}$/.test(w.ownerScope)
  )
    fail();
  const owner = record(w.owner, [
    'control_node',
    'component_node',
    'paragraph_node',
    'paragraph',
    'anchor_unit',
    'instance_id',
    'source_sha256',
  ]);
  for (const k of [
    'control_node',
    'component_node',
    'paragraph_node',
    'paragraph',
    'anchor_unit',
    'instance_id',
  ])
    if (!uint(owner[k])) fail();
  const margins = record(w.margins, ['left', 'right', 'top', 'bottom']);
  if (Object.values(margins).some((n) => !word(n))) fail();
  const t = record(w.ticket, ['document', 'generation', 'owner', 'epoch']);
  if (w.editable && (w.inline || w.wrapOrdinal !== 1 || w.reason !== null)) fail();
  return Object.freeze({
    ...w,
    selector: checkedHwp5OuterMarginsSelector(w.selector),
    owner: Object.freeze({ ...owner, source_sha256: digest(owner.source_sha256) }),
    ticket: Object.freeze({
      document: words(t.document),
      generation: words(t.generation),
      owner: words(t.owner),
      epoch: words(t.epoch),
    }),
    viewEpoch: words(w.viewEpoch),
    margins: Object.freeze(margins),
  });
}
export function checkedHwp5VerticalMarginsObservation(value) {
  const v = record(value, ['schemaVersion', 'profile', 'witness']);
  if (v.schemaVersion !== 1 || v.profile !== HWP5_VERTICAL_MARGINS_PROFILE) fail();
  return Object.freeze({ ...v, witness: witness(v.witness) });
}
export function checkedHwp5VerticalMarginsRequest(value) {
  const v = record(value, ['schemaVersion', 'profile', 'witness', 'top', 'bottom']);
  const observed = checkedHwp5VerticalMarginsObservation({
    schemaVersion: v.schemaVersion,
    profile: v.profile,
    witness: v.witness,
  });
  const w = observed.witness;
  if (!w.editable || w.inline || w.wrapOrdinal !== 1 || w.reason !== null) fail();
  if (
    !word(v.top) ||
    !word(v.bottom) ||
    (v.top < 0 && v.top !== w.margins.top) ||
    (v.bottom < 0 && v.bottom !== w.margins.bottom)
  )
    fail();
  return Object.freeze({ ...observed, top: v.top, bottom: v.bottom });
}
export function createHwp5VerticalMarginsApi({ wasm, memory, check }) {
  let ownerScope = null;
  try {
    const nonce = globalThis.crypto?.randomUUID?.();
    if (
      typeof nonce === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)
    )
      ownerScope = `h5-vertical-margins:${nonce.toLowerCase()}`;
  } catch {
    /* Optional feature stays unavailable; old engines still initialize. */
  }
  const version = 'hwp5_edit_vertical_outer_margins_version';
  const read = 'hwp5_edit_vertical_outer_margins';
  const write = 'hwp5_edit_set_vertical_outer_margins';
  const supported = () =>
    !!ownerScope &&
    [version, read, write].every((k) => typeof wasm[k] === 'function') &&
    wasm[version]() === 1;
  const ready = () => {
    check();
    if (!supported()) throw Error('Hwp5VerticalMarginsUnavailable');
  };
  return {
    supportsVerticalObjectOuterMargins() {
      check();
      return supported();
    },
    verticalObjectOuterMargins(value) {
      ready();
      const s = checkedHwp5OuterMarginsSelector(value);
      let raw;
      try {
        if (wasm[read](s.section, s.node, s.kind === 'picture' ? 0 : 1) !== 1) throw memory.error();
        const n = wasm.hwp5_edit_output_len();
        if (!uint(n) || n === 0 || n > 16384) fail();
        raw = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm.hwp5_edit_output_ptr(), n),
          ),
        );
      } finally {
        wasm.hwp5_edit_output_free();
      }
      const r = record(raw, ['schemaVersion', 'profile', 'witness']);
      const nativeWitness = record(r.witness, [
        'schemaVersion',
        'format',
        'selector',
        'owner',
        'ticket',
        'viewEpoch',
        'historyRevision',
        'margins',
        'editable',
        'reason',
        'wrapOrdinal',
        'inline',
      ]);
      const observed = checkedHwp5VerticalMarginsObservation({
        ...r,
        witness: { ...nativeWitness, ownerScope },
      });
      const selected = observed.witness.selector;
      if (selected.section !== s.section || selected.node !== s.node || selected.kind !== s.kind)
        throw Error('Hwp5VerticalMarginsBindingMismatch');
      return observed;
    },
    setVerticalObjectOuterMargins(value) {
      ready();
      const r = checkedHwp5VerticalMarginsRequest(value);
      if (r.witness.ownerScope !== ownerScope) throw Error('ForeignHwp5VerticalMarginsOwner');
      const { ownerScope: _scope, ...nativeWitness } = r.witness;
      const bytes = new TextEncoder().encode(JSON.stringify({ ...r, witness: nativeWitness }));
      if (bytes.length > 16384) fail();
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, n) => wasm[write](ptr, n),
        'InvalidHwp5VerticalMarginsResult',
      );
    },
  };
}
