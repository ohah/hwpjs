import { HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS } from './abi-schema.mjs';
import { decodeSourceTableCellSplitCapability } from './source-table-cell-split-capability.mjs';
import { createSourceTableCellSplitApi } from './source-table-cell-merge.mjs';
let sequence = 0n;
export function createHwp5SourceTableCellSplitApi({ wasm, memory, check }) {
  const supported = HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS.every(
    (name) => typeof wasm[name] === 'function',
  );
  const scope = globalThis.crypto?.randomUUID?.() ?? 'h5-split-' + ++sequence;
  const bindingSource = {
    supportsDocumentInsertionAbi: () => supported,
    documentInsertionCapabilities() {
      check();
      if (!supported) throw Error('Hwp5SourceTableCellSplitAbiUnavailable');
      try {
        if (wasm.hwp5_edit_source_table_cell_split_capabilities() !== 1) throw memory.error();
        const length = wasm.hwp5_edit_output_len();
        if (!Number.isInteger(length) || length <= 0 || length > 1024)
          throw Error('InvalidSourceTableSplitCapabilities');
        const cap = decodeSourceTableCellSplitCapability(
          JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(
              memory.copy(wasm.hwp5_edit_output_ptr(), length),
            ),
          ),
        );
        if (cap.format !== 'hwp5' || cap.binding.session.includes(':'))
          throw Error('InvalidSourceTableSplitCapabilities');
        return { ...cap, binding: { ...cap.binding, session: scope + ':' + cap.binding.session } };
      } finally {
        wasm.hwp5_edit_output_free();
      }
    },
  };
  return createSourceTableCellSplitApi({
    wasm,
    memory,
    check,
    documentInsert: bindingSource,
    format: 'hwp5',
  });
}
