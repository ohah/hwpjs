import { checkedOriginalCellSelector } from './original-cell-vertical-alignment.mjs';
export { checkedOriginalCellSelector };
import { ownObjectGeometryRecord as record } from './object-geometry-edit.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { nativeDocumentParagraph } from './document-text-coordinates.mjs';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const axes = ['left', 'right', 'top', 'bottom'];
export function checkedCellInsetsPatch(input) {
  const v = record(input, ['mode', ...axes], ['mode']);
  if (v.mode === 'inherit') {
    if (Object.keys(v).length !== 1) throw Error('InvalidCellInsetsPatch');
  } else if (v.mode === 'custom') {
    for (const key of axes)
      if (Object.hasOwn(v, key) && (!uint(v[key]) || v[key] > 32767))
        throw Error('InvalidCellInsetsPatch');
  } else throw Error('InvalidCellInsetsPatch');
  return Object.freeze(v);
}
function tuple(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== 4
  )
    throw Error('InvalidCellInsetsObservation');
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).length !== 5) throw Error('InvalidCellInsetsObservation');
  const result = [];
  for (let i = 0; i < 4; i++) {
    if (!d[i] || !('value' in d[i]) || !uint(d[i].value) || d[i].value > 32767)
      throw Error('InvalidCellInsetsObservation');
    result.push(d[i].value);
  }
  return Object.freeze(result);
}
export function checkedCellInsetsObservation(input) {
  const keys = [
    'schemaVersion',
    'format',
    'section',
    'paragraph',
    'tableNode',
    'listNode',
    'lease',
    'historyRevision',
    'editable',
    'mode',
    'effective',
    'tableDefaults',
    'frame',
  ];
  const v = record(input, [...keys, 'scope'], keys);
  checkedOriginalCellSelector({
    section: v.section,
    paragraph: v.paragraph,
    tableNode: v.tableNode,
    listNode: v.listNode,
  });
  if (
    v.schemaVersion !== 1 ||
    !['hwp5', 'hwpx'].includes(v.format) ||
    !uint(v.historyRevision) ||
    typeof v.editable !== 'boolean' ||
    !['inherit', 'custom'].includes(v.mode) ||
    (v.editable
      ? typeof v.lease !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(v.lease) ||
        BigInt(v.lease) > 0xffffffffffffffffn
      : v.lease !== null) ||
    (v.scope !== undefined && (typeof v.scope !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.scope)))
  )
    throw Error('InvalidCellInsetsObservation');
  v.effective = tuple(v.effective);
  v.tableDefaults = tuple(v.tableDefaults);
  const frame = record(v.frame, ['width', 'height']);
  if (
    !uint(frame.width) ||
    !uint(frame.height) ||
    frame.width <= v.effective[0] + v.effective[1] ||
    frame.height <= v.effective[2] + v.effective[3] ||
    (v.mode === 'inherit' && !v.effective.every((n, i) => n === v.tableDefaults[i]))
  )
    throw Error('InvalidCellInsetsObservation');
  v.frame = Object.freeze(frame);
  return Object.freeze(v);
}
export function checkedCellInsetsRequest(input) {
  const v = record(input, ['before', 'patch']);
  const before = checkedCellInsetsObservation(v.before);
  if (!before.editable || !before.scope) throw Error('OriginalCellInsetsReadOnly');
  const patch = checkedCellInsetsPatch(v.patch);
  const effective =
    patch.mode === 'inherit'
      ? before.tableDefaults
      : axes.map((key, i) => (Object.hasOwn(patch, key) ? patch[key] : before.effective[i]));
  if (
    before.frame.width <= effective[0] + effective[1] ||
    before.frame.height <= effective[2] + effective[3]
  )
    throw Error('InvalidCellInsetsInnerBox');
  return Object.freeze({ before, patch });
}
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
}
/** Full Native witnesses stay in Native. The scoped JS lease is single-use and never refreshed at commit. */
export function createOriginalCellInsetsApi({ wasm, memory, check, prefix }) {
  if (!['hwp5_edit', 'hwpx_edit'].includes(prefix)) throw Error('InvalidOriginalCellFormat');
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const version = `${prefix}_original_cell_insets_version`;
  const query = `${prefix}_original_cell_insets`;
  const commit = `${prefix}_set_original_cell_insets`;
  let retained;
  const supported = () =>
    [version, query, commit].every((name) => typeof wasm[name] === 'function') &&
    wasm[version]() === 1 &&
    typeof globalThis.crypto?.randomUUID === 'function';
  return {
    supportsOriginalCellInsets() {
      check();
      return supported();
    },
    originalCellInsets(selector) {
      check();
      retained = undefined;
      const s = checkedOriginalCellSelector(selector);
      const paragraph = nativeDocumentParagraph(format, s.paragraph);
      if (paragraph === undefined) throw Error('InvalidOriginalCellOwner');
      if (!supported()) throw Error('OriginalCellInsetsUnavailable');
      let raw;
      try {
        if (wasm[query](s.section, paragraph) !== 1) throw memory.error();
        const bytes = memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]());
        if (bytes.byteLength > 4096) throw RangeError('LimitExceeded');
        raw = checkedCellInsetsObservation(JSON.parse(utf8.decode(bytes)));
      } finally {
        wasm[`${prefix}_output_free`]();
      }
      if (
        raw.format !== format ||
        raw.section !== s.section ||
        raw.paragraph !== paragraph ||
        raw.tableNode !== s.tableNode ||
        raw.listNode !== s.listNode ||
        raw.scope !== undefined
      )
        throw Error('OriginalCellOwnerMismatch');
      const before = checkedCellInsetsObservation({
        ...raw,
        paragraph: s.paragraph,
        scope: globalThis.crypto.randomUUID(),
      });
      retained = before;
      return before;
    },
    setOriginalCellInsets(input) {
      check();
      const request = checkedCellInsetsRequest(input);
      if (!supported()) throw Error('OriginalCellInsetsUnavailable');
      if (!retained || !same(retained, request.before)) throw Error('StaleOriginalCellLease');
      // Consume before entering Native: unknown completion must never cause retry.
      retained = undefined;
      const bytes = encoder.encode(
        JSON.stringify({ lease: request.before.lease, patch: request.patch }),
      );
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, size) => wasm[commit](ptr, size),
        'InvalidOriginalCellInsetsOutcome',
      );
    },
  };
}
