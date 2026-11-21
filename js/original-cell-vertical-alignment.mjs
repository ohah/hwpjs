import { ownObjectGeometryRecord as record } from './object-geometry-edit.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { nativeDocumentParagraph } from './document-text-coordinates.mjs';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
export function checkedOriginalCellSelector(input) {
  const v = record(input, ['section', 'paragraph', 'tableNode', 'listNode']);
  if (!Object.values(v).every(uint)) throw Error('InvalidOriginalCellOwner');
  return Object.freeze(v);
}
export function checkedOriginalCellAlignment(value) {
  if (!['TOP', 'CENTER', 'BOTTOM'].includes(value)) throw Error('UnsupportedCellVerticalAlignment');
  return value;
}
export function checkedOriginalCellObservation(input) {
  const v = record(
    input,
    [
      'schemaVersion',
      'format',
      'section',
      'paragraph',
      'tableNode',
      'listNode',
      'lease',
      'historyRevision',
      'value',
      'editable',
      'scope',
    ],
    [
      'schemaVersion',
      'format',
      'section',
      'paragraph',
      'tableNode',
      'listNode',
      'lease',
      'historyRevision',
      'value',
      'editable',
    ],
  );
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
    typeof v.lease !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(v.lease) ||
    BigInt(v.lease) > 0xffffffffffffffffn ||
    (v.scope !== undefined && (typeof v.scope !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.scope)))
  )
    throw Error('InvalidOriginalCellObservation');
  if (v.value !== null) checkedOriginalCellAlignment(v.value);
  return Object.freeze(v);
}
export function checkedOriginalCellRequest(input) {
  const v = record(input, ['before', 'value']);
  const before = checkedOriginalCellObservation(v.before);
  if (!before.editable || !before.scope) throw Error('OriginalCellVerticalAlignmentReadOnly');
  return Object.freeze({ before, value: checkedOriginalCellAlignment(v.value) });
}
function same(a, b) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => a[key] === b[key])
  );
}
/** Full Native witnesses stay in Native. The scoped JS lease is single-use and never refreshed at commit. */
export function createOriginalCellVerticalAlignmentApi({ wasm, memory, check, prefix }) {
  if (!['hwp5_edit', 'hwpx_edit'].includes(prefix)) throw Error('InvalidOriginalCellFormat');
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const version = `${prefix}_original_cell_vertical_alignment_version`;
  const query = `${prefix}_original_cell_vertical_alignment`;
  const commit = `${prefix}_set_original_cell_vertical_alignment`;
  let retained;
  const supported = () =>
    [version, query, commit].every((name) => typeof wasm[name] === 'function') &&
    wasm[version]() === 1 &&
    typeof globalThis.crypto?.randomUUID === 'function';
  return {
    supportsOriginalCellVerticalAlignment() {
      check();
      return supported();
    },
    originalCellVerticalAlignment(selector) {
      check();
      retained = undefined;
      const s = checkedOriginalCellSelector(selector);
      const paragraph = nativeDocumentParagraph(format, s.paragraph);
      if (paragraph === undefined) throw Error('InvalidOriginalCellOwner');
      if (!supported()) throw Error('OriginalCellVerticalAlignmentUnavailable');
      let raw;
      try {
        if (wasm[query](s.section, paragraph) !== 1) throw memory.error();
        const bytes = memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]());
        if (bytes.byteLength > 4096) throw RangeError('LimitExceeded');
        raw = checkedOriginalCellObservation(JSON.parse(utf8.decode(bytes)));
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
      const before = checkedOriginalCellObservation({
        ...raw,
        paragraph: s.paragraph,
        scope: globalThis.crypto.randomUUID(),
      });
      retained = before;
      return before;
    },
    setOriginalCellVerticalAlignment(input) {
      check();
      const request = checkedOriginalCellRequest(input);
      if (!supported()) throw Error('OriginalCellVerticalAlignmentUnavailable');
      if (!retained || !same(retained, request.before)) throw Error('StaleOriginalCellLease');
      // Consume before entering Native: unknown completion must never cause retry.
      retained = undefined;
      const bytes = encoder.encode(
        JSON.stringify({ lease: request.before.lease, value: request.value }),
      );
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, size) => wasm[commit](ptr, size),
        'InvalidOriginalCellAlignmentOutcome',
      );
    },
  };
}
