import { ownObjectGeometryRecord as record } from './object-geometry-edit.mjs';
import { checkedOriginalCellAlignment } from './original-cell-vertical-alignment.mjs';
import { nativeDocumentParagraph } from './document-text-coordinates.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const uint = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
const invalid = () => {
  throw Error('InvalidOriginalCellBlock');
};
function ownArray(input, limit) {
  if (!Array.isArray(input)) return invalid();
  const length = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > limit) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== length + 1) return invalid();
  const out = [];
  for (let i = 0; i < length; i++) {
    const row = descriptors[String(i)];
    if (!row || !Object.hasOwn(row, 'value')) return invalid();
    out.push(row.value);
  }
  return out;
}
export function checkedOriginalCellBlockWitness(input) {
  const p = record(input, ['section', 'tableNode', 'rows', 'columns', 'rectangle', 'cells']);
  if (
    ![p.section, p.tableNode, p.rows, p.columns].every(uint) ||
    !p.rows ||
    !p.columns ||
    p.rows * p.columns > 4096
  )
    return invalid();
  const rectangle = record(p.rectangle, ['top', 'left', 'bottom', 'right']);
  if (
    !Object.values(rectangle).every(uint) ||
    rectangle.top >= rectangle.bottom ||
    rectangle.left >= rectangle.right ||
    rectangle.bottom > p.rows ||
    rectangle.right > p.columns
  )
    return invalid();
  const owners = new Set(),
    paragraphs = new Set();
  let total = 0;
  const cells = ownArray(p.cells, 4096).map((input) => {
    const cell = record(input, ['listNode', 'row', 'column', 'paragraphs']);
    if (
      ![cell.listNode, cell.row, cell.column].every(uint) ||
      cell.row >= p.rows ||
      cell.column >= p.columns ||
      owners.has(cell.listNode)
    )
      return invalid();
    owners.add(cell.listNode);
    const members = ownArray(cell.paragraphs, 100000);
    total += members.length;
    if (total > 100000) return invalid();
    for (const paragraph of members) {
      if (!uint(paragraph) || paragraphs.has(paragraph)) return invalid();
      paragraphs.add(paragraph);
    }
    return Object.freeze({ ...cell, paragraphs: Object.freeze(members) });
  });
  return Object.freeze({ ...p, rectangle: Object.freeze(rectangle), cells: Object.freeze(cells) });
}
export function checkedOriginalCellBlockObservation(input) {
  const names = [
    'schemaVersion',
    'format',
    'section',
    'tableNode',
    'rows',
    'columns',
    'rectangle',
    'cells',
    'lease',
    'historyRevision',
    'editable',
  ];
  const p = record(input, [...names, 'scope'], names);
  if (
    p.schemaVersion !== 1 ||
    !['hwp5', 'hwpx'].includes(p.format) ||
    !uint(p.historyRevision) ||
    typeof p.editable !== 'boolean' ||
    typeof p.lease !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(p.lease) ||
    BigInt(p.lease) > 0xffffffffffffffffn ||
    (p.scope !== undefined && (typeof p.scope !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.scope)))
  )
    return invalid();
  const rawCells = ownArray(p.cells, 4096).map((row) =>
    record(row, ['listNode', 'row', 'column', 'paragraphs', 'value', 'editable']),
  );
  const witness = checkedOriginalCellBlockWitness({
    section: p.section,
    tableNode: p.tableNode,
    rows: p.rows,
    columns: p.columns,
    rectangle: p.rectangle,
    cells: rawCells.map(({ value: _value, editable: _editable, ...cell }) => cell),
  });
  const cells = witness.cells.map((cell, index) => {
    const raw = rawCells[index];
    if (raw.value !== null) checkedOriginalCellAlignment(raw.value);
    if (typeof raw.editable !== 'boolean') return invalid();
    return Object.freeze({ ...cell, value: raw.value, editable: raw.editable });
  });
  if (p.editable !== cells.every((cell) => cell.editable)) return invalid();
  return Object.freeze({ ...p, rectangle: witness.rectangle, cells: Object.freeze(cells) });
}
export function checkedOriginalCellBlockRequest(input) {
  const p = record(input, ['before', 'value']);
  const before = checkedOriginalCellBlockObservation(p.before);
  if (!before.editable || !before.scope) throw Error('OriginalCellVerticalAlignmentReadOnly');
  return Object.freeze({ before, value: checkedOriginalCellAlignment(p.value) });
}
function same(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]))
  );
}
export function createOriginalCellVerticalAlignmentBatchApi({ wasm, memory, check, prefix }) {
  if (!['hwp5_edit', 'hwpx_edit'].includes(prefix)) throw Error('InvalidOriginalCellFormat');
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const version = `${prefix}_original_cell_vertical_alignment_batch_version`,
    query = `${prefix}_original_cell_vertical_alignment_batch`,
    commit = `${prefix}_set_original_cell_vertical_alignment_batch`;
  let retained;
  const supported = () =>
    [version, query, commit].every((name) => typeof wasm[name] === 'function') &&
    wasm[version]() === 1 &&
    typeof globalThis.crypto?.randomUUID === 'function';
  return {
    supportsOriginalCellVerticalAlignmentBatch() {
      check();
      return supported();
    },
    originalCellVerticalAlignmentBatch(input) {
      check();
      retained = undefined;
      const witness = checkedOriginalCellBlockWitness(input);
      const native = checkedOriginalCellBlockWitness({
        ...witness,
        cells: witness.cells.map((cell) => ({
          ...cell,
          paragraphs: cell.paragraphs.map((paragraph) => {
            const value = nativeDocumentParagraph(format, paragraph);
            if (value === undefined) throw Error('InvalidOriginalCellOwner');
            return value;
          }),
        })),
      });
      const bytes = encoder.encode(JSON.stringify(native));
      if (bytes.byteLength > 1024 * 1024) throw RangeError('LimitExceeded');
      check();
      if (!supported()) throw Error('OriginalCellVerticalAlignmentBatchUnavailable');
      let raw;
      try {
        raw = memory.withBytes(bytes, (ptr, len) => {
          if (wasm[query](ptr, len) !== 1) throw memory.error();
          const size = wasm[`${prefix}_output_len`]();
          if (!Number.isSafeInteger(size) || size < 1 || size > 4 * 1024 * 1024)
            throw RangeError('LimitExceeded');
          return checkedOriginalCellBlockObservation(
            JSON.parse(decoder.decode(memory.copy(wasm[`${prefix}_output_ptr`](), size))),
          );
        });
      } finally {
        wasm[`${prefix}_output_free`]();
      }
      if (
        raw.scope !== undefined ||
        raw.format !== format ||
        !['section', 'tableNode', 'rows', 'columns', 'rectangle'].every((key) =>
          same(raw[key], native[key]),
        ) ||
        raw.cells.length !== native.cells.length
      )
        throw Error('OriginalCellOwnerMismatch');
      const expected = new Map(native.cells.map((cell) => [cell.listNode, cell]));
      const publicCells = new Map(witness.cells.map((cell) => [cell.listNode, cell]));
      const cells = raw.cells.map((cell) => {
        const target = expected.get(cell.listNode);
        if (
          !target ||
          !['listNode', 'row', 'column', 'paragraphs'].every((key) => same(cell[key], target[key]))
        )
          throw Error('OriginalCellOwnerMismatch');
        // Only after checking Native ordinals restore the captured public HX
        // membership. Structured clones retain scalar/array equality, not identity.
        return { ...cell, paragraphs: publicCells.get(cell.listNode).paragraphs };
      });
      const before = checkedOriginalCellBlockObservation({
        ...raw,
        cells,
        scope: globalThis.crypto.randomUUID(),
      });
      retained = before;
      return before;
    },
    setOriginalCellVerticalAlignmentBatch(input) {
      check();
      const request = checkedOriginalCellBlockRequest(input);
      if (!supported()) throw Error('OriginalCellVerticalAlignmentBatchUnavailable');
      if (!retained || !same(retained, request.before)) throw Error('StaleOriginalCellLease');
      retained = undefined;
      const bytes = encoder.encode(
        JSON.stringify({ lease: request.before.lease, value: request.value }),
      );
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, len) => wasm[commit](ptr, len),
        'InvalidOriginalCellAlignmentOutcome',
      );
    },
  };
}
