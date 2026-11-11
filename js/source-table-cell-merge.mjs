import { HWPX_SOURCE_TABLE_CELL_MERGE_FUNCTIONS } from './abi-schema.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

/** @typedef {{session: string, revision: number, serial: string}} MergeBinding */
/**
 * All rectangle edges are zero-based and bottom/right are exclusive.
 * @typedef {{binding: MergeBinding, section: number, tableNode: number,
 * expectedRows: number, expectedColumns: number,
 * top: number, left: number, bottom: number, right: number}} SourceTableCellMergeRequest
 */
const coordinates = [
  'section',
  'tableNode',
  'expectedRows',
  'expectedColumns',
  'top',
  'left',
  'bottom',
  'right',
];

function ownRecord(input, keys) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw new TypeError('InvalidSourceTableMergeRequest');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw new TypeError('InvalidSourceTableMergeRequest');
  const result = Object.create(null);
  for (const key of keys) {
    if (!Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))
      throw new TypeError('InvalidSourceTableMergeRequest');
    result[key] = descriptors[key].value;
  }
  return result;
}

const isU32 = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
const words = (text) => {
  const value = BigInt(text);
  return [Number(value & 0xffffffffn), Number(value >> 32n)];
};

export function createSourceTableCellMergeApi({ wasm, memory, check, documentInsert }) {
  const supported =
    documentInsert.supportsDocumentInsertionAbi() &&
    HWPX_SOURCE_TABLE_CELL_MERGE_FUNCTIONS.every((name) => typeof wasm[name] === 'function');
  const requireSupport = () => {
    check();
    if (!supported) throw new Error('HwpxSourceTableCellMergeAbiUnavailable');
  };
  return {
    supportsSourceTableCellMerge() {
      check();
      return supported;
    },
    /** @returns {MergeBinding} */
    sourceTableCellMergeBinding() {
      requireSupport();
      return documentInsert.documentInsertionCapabilities().binding;
    },
    /** @param {SourceTableCellMergeRequest} request */
    mergeSourceTableCells(request) {
      requireSupport();
      const value = ownRecord(request, [...coordinates, 'binding']);
      if (!coordinates.every((key) => isU32(value[key])))
        throw new RangeError('InvalidSourceTableMergeCoordinate');
      const { binding } = value;
      const ticket = ownRecord(binding, ['session', 'revision', 'serial']);
      const current = documentInsert.documentInsertionCapabilities().binding;
      // Compare opaque SDK scope before translating the existing Native ticket.
      // Native repeats the epoch, revision and serial check at mutation.
      if (
        ticket.session !== current.session ||
        ticket.revision !== current.revision ||
        ticket.serial !== current.serial
      )
        return {
          nativeCode: 0,
          application: 'unapplied',
          changed: false,
          error: 'StaleSourceTableMergeBinding',
        };
      return applyNativeEdit(
        { withBytes: (_, invoke) => invoke(0, 0), error: () => memory.error() },
        null,
        () =>
          wasm.hwpx_edit_merge_source_table_cells(
            ...coordinates.map((key) => value[key]),
            current.revision,
            ...words(current.session.slice(current.session.lastIndexOf(':') + 2)),
            ...words(current.serial),
          ),
        'InvalidSourceTableMergeCompletion',
      );
    },
  };
}
