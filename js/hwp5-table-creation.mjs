import { createCreatedTableGridApi } from './created-table-grid.mjs';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
import { decodeHwp5CreatedTables } from './hwp5-created-tables.mjs';
import { decodeTableCreationResources } from './table-creation-resources.mjs';
import {
  captureTableInitialTexts,
  captureTableTextRequest,
  encodeTableTextRequest,
} from './table-initial-texts.mjs';

export function createHwp5TableCreationApi({ wasm, memory, check, output, u32 }) {
  return {
    ...createCreatedTableGridApi({
      wasm,
      memory,
      check,
      prefix: 'hwp5_edit',
      unavailable: 'Hwp5CreatedTableGridAbiUnavailable',
    }),
    supportsTableInitialTexts() {
      check();
      return typeof wasm.hwp5_edit_insert_table_with_texts === 'function';
    },
    supportsTableCreation() {
      check();
      return typeof wasm.hwp5_edit_insert_table === 'function';
    },
    tableCreationResources() {
      check();
      if (typeof wasm.hwp5_edit_table_creation_resources !== 'function')
        throw new Error('Hwp5TableCreationResourcesAbiUnavailable');
      return decodeTableCreationResources(
        output(() => wasm.hwp5_edit_table_creation_resources()).bytes,
      );
    },
    createdTables(section) {
      check();
      if (typeof wasm.hwp5_edit_created_tables !== 'function')
        throw new Error('Hwp5CreatedTablesAbiUnavailable');
      return decodeHwp5CreatedTables(
        output(() => wasm.hwp5_edit_created_tables(u32(section, 'section'))).bytes,
      );
    },
    insertTable(request) {
      check();
      if (typeof wasm.hwp5_edit_insert_table !== 'function')
        throw new Error('Hwp5TableCreationAbiUnavailable');
      if (!request || typeof request !== 'object' || Array.isArray(request))
        throw new TypeError('InvalidTableCreationRequest');
      const withTexts = Object.hasOwn(request, 'cell_texts');
      let bytes;
      if (withTexts) {
        if (typeof wasm.hwp5_edit_insert_table_with_texts !== 'function')
          throw new Error('Hwp5TableInitialTextsAbiUnavailable');
        const captured = captureTableTextRequest(request);
        captured.cell_texts = captureTableInitialTexts(
          captured.rows,
          captured.columns,
          captured.cell_texts,
        );
        bytes = encodeTableTextRequest(captured);
      } else {
        const json = JSON.stringify(request);
        if (json.length > 1024 * 1024) throw new RangeError('LimitExceeded');
        bytes = encoder.encode(json);
        if (bytes.length > 1024 * 1024) throw new RangeError('LimitExceeded');
      }
      const response = memory.withBytes(
        bytes,
        (ptr, size) =>
          output(() =>
            withTexts
              ? wasm.hwp5_edit_insert_table_with_texts(ptr, size)
              : wasm.hwp5_edit_insert_table(ptr, size),
          ).bytes,
      );
      const value = JSON.parse(decoder.decode(response));
      if (
        !value ||
        Object.keys(value).join() !== 'identity' ||
        typeof value.identity !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(value.identity) ||
        BigInt(value.identity) > 0xffffffffffffffffn
      )
        throw new Error('InvalidCreatedTableIdentity');
      return value.identity;
    },
  };
}
