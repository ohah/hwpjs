import { ownObjectGeometryRecord } from './object-geometry-edit.mjs';
import { checkedObjectOuterMargins } from './object-outer-margins.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const fail = () => { throw Error('InvalidHwp5OuterMargins'); };
const uint = (n) => Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n <= 0xffffffff;
const record = ownObjectGeometryRecord;
const keys = ['left', 'right', 'top', 'bottom'];
const words = (value) => {
  const v = record(value, ['lo', 'hi']);
  if (!uint(v.lo) || !uint(v.hi)) fail();
  return Object.freeze(v);
};
export function checkedHwp5OuterMarginsSelector(value) {
  const v = record(value, ['section', 'node', 'kind']);
  if (!uint(v.section) || !uint(v.node) || !['picture', 'textbox'].includes(v.kind)) fail();
  return Object.freeze(v);
}
export function checkedHwp5OuterMarginsObservation(value) {
  const v = record(value, ['schemaVersion', 'format', 'selector', 'owner', 'ticket', 'viewEpoch', 'historyRevision', 'margins', 'editable', 'reason', 'wrapOrdinal', 'inline', 'ownerScope']);
  if (v.schemaVersion !== 1 || v.format !== 'hwp5' || !uint(v.historyRevision) || typeof v.editable !== 'boolean' || typeof v.inline !== 'boolean' || !Number.isInteger(v.wrapOrdinal) || v.wrapOrdinal < 0 || v.wrapOrdinal > 7 || (v.reason !== null && (typeof v.reason !== 'string' || v.reason.length > 256)) || typeof v.ownerScope !== 'string' || !/^h5-margins:[0-9a-f-]{36}$/.test(v.ownerScope)) fail();
  const owner = record(v.owner, ['control_node', 'component_node', 'paragraph_node', 'paragraph', 'anchor_unit', 'instance_id', 'source_sha256']);
  for (const k of ['control_node', 'component_node', 'paragraph_node', 'paragraph', 'anchor_unit', 'instance_id']) if (!uint(owner[k])) fail();
  if (!Array.isArray(owner.source_sha256) || owner.source_sha256.length !== 32 || owner.source_sha256.some(n => !uint(n) || n > 255)) fail();
  const t = record(v.ticket, ['document', 'generation', 'owner', 'epoch']);
  const margins = record(v.margins, keys);
  // Observed signed source words are retained exactly; new writes use HX's nonnegative policy.
  for (const n of Object.values(margins)) if (!Number.isInteger(n) || Object.is(n, -0) || n < -32768 || n > 32767) fail();
  if (v.editable && (v.inline || v.wrapOrdinal !== 0 || v.reason !== null)) fail();
  return Object.freeze({ ...v, selector: checkedHwp5OuterMarginsSelector(v.selector), owner: Object.freeze({ ...owner, source_sha256: Object.freeze([...owner.source_sha256]) }), ticket: Object.freeze(Object.fromEntries(Object.entries(t).map(([k, n]) => [k, words(n)]))), viewEpoch: words(v.viewEpoch), margins: Object.freeze(margins) });
}
export function checkedHwp5OuterMarginsRequest(value) {
  const v = record(value, ['schemaVersion', 'witness', 'margins']);
  const witness = checkedHwp5OuterMarginsObservation(v.witness);
  if (v.schemaVersion !== 1 || !witness.editable || witness.inline || witness.wrapOrdinal !== 0 || witness.reason !== null) fail();
  return Object.freeze({ schemaVersion: 1, witness, margins: checkedObjectOuterMargins(v.margins) });
}
export function createHwp5OuterMarginsApi({ wasm, memory, check }) {
  let ownerScope = null;
  try {
    const scope = globalThis.crypto?.randomUUID?.();
    if (typeof scope === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope))
      ownerScope = `h5-margins:${scope.toLowerCase()}`;
  } catch {
    // Optional entropy failure disables only this feature, including on old engines.
  }
  const supported = () => !!ownerScope && ['hwp5_edit_object_outer_margins_version', 'hwp5_edit_object_outer_margins', 'hwp5_edit_set_object_outer_margins'].every(k => typeof wasm[k] === 'function') && wasm.hwp5_edit_object_outer_margins_version() === 1;
  const ready = () => { check(); if (!supported()) throw Error('Hwp5OuterMarginsUnavailable'); };
  return {
    supportsObjectOuterMargins() { check(); return supported(); },
    objectOuterMargins(value) {
      ready();
      const selected = checkedHwp5OuterMarginsSelector(value);
      let raw;
      try {
        if (wasm.hwp5_edit_object_outer_margins(selected.section, selected.node, selected.kind === 'picture' ? 0 : 1) !== 1) throw memory.error();
        const n = wasm.hwp5_edit_output_len();
        if (!uint(n) || n === 0 || n > 16384) fail();
        raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(memory.copy(wasm.hwp5_edit_output_ptr(), n)));
      } finally { wasm.hwp5_edit_output_free(); }
      // No extra raw fields, including a spoofed JS scope, are admitted.
      record(raw, ['schemaVersion', 'format', 'selector', 'owner', 'ticket', 'viewEpoch', 'historyRevision', 'margins', 'editable', 'reason', 'wrapOrdinal', 'inline']);
      const observed = checkedHwp5OuterMarginsObservation({ ...raw, ownerScope });
      if (observed.selector.section !== selected.section || observed.selector.node !== selected.node || observed.selector.kind !== selected.kind) throw Error('Hwp5OuterMarginsBindingMismatch');
      return observed;
    },
    setObjectOuterMargins(value) {
      ready();
      const v = checkedHwp5OuterMarginsRequest(value);
      if (v.witness.ownerScope !== ownerScope) throw Error('ForeignHwp5OuterMarginsOwner');
      const { ownerScope: _scope, ...witness } = v.witness;
      const bytes = new TextEncoder().encode(JSON.stringify({ ...v, witness }));
      if (bytes.length > 16384) fail();
      return applyNativeEdit(memory, bytes, (ptr, n) => wasm.hwp5_edit_set_object_outer_margins(ptr, n), 'InvalidHwp5OuterMarginsResult');
    },
  };
}
