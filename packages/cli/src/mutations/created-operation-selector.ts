import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-insert.mjs';
import {
  checkedInlineObjectSelector,
  type InlineObjectSelector,
} from '../../../../js/hwpx-inline-object-placement.mjs';
import type { DocumentOperation } from './validate.ts';
export type InlineObjectOperationSelector =
  | InlineObjectSelector
  | {
      readonly section: number;
      readonly created_cell: {
        readonly operation: number;
        readonly row: number;
        readonly column: number;
      };
    };
export interface CreatedOperationTable {
  readonly section: number;
  readonly identity: string;
}
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 0xffffffff &&
  !Object.is(value, -0);
export function checkedOperationSelector(input: unknown): InlineObjectOperationSelector {
  const descriptor =
    input && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'created_cell')
      : undefined;
  const cell = descriptor && 'value' in descriptor ? descriptor.value : undefined;
  if (cell && Object.hasOwn(cell, 'operation')) {
    const selector = inlineInsertRecord(input, ['section', 'created_cell']);
    const captured = inlineInsertRecord(cell, ['operation', 'row', 'column']);
    if (![selector.section, captured.operation, captured.row, captured.column].every(uint))
      throw Error('InvalidInlineObjectOperationSelector');
    return {
      section: selector.section as number,
      created_cell: captured as { operation: number; row: number; column: number },
    };
  }
  return checkedInlineObjectSelector(input);
}
export function validateCreatedOperationReferences(operations: readonly DocumentOperation[]): void {
  for (const [index, operation] of operations.entries()) {
    if (
      !['chart-create', 'equation-insert', 'created-cell-splice'].includes(operation.kind) ||
      !('selector' in operation)
    )
      continue;
    const cell = operation.selector.created_cell;
    if (!cell || !('operation' in cell)) continue;
    const earlier = operations[cell.operation];
    if (
      cell.operation >= index ||
      !earlier ||
      earlier.kind !== 'table-insert' ||
      earlier.section !== operation.selector.section ||
      cell.row >= earlier.rows ||
      cell.column >= earlier.columns
    )
      throw Error('InvalidCreatedTableOperationReference');
  }
}
export function resolveOperationSelector(
  selector: InlineObjectOperationSelector,
  tables: ReadonlyMap<number, CreatedOperationTable>,
): InlineObjectSelector {
  const cell = selector.created_cell;
  if (cell && 'operation' in cell) {
    const table = tables.get(cell.operation);
    if (!table || table.section !== selector.section)
      throw Error('MissingCreatedTableOperationResult');
    return checkedInlineObjectSelector({
      section: table.section,
      created_cell: { identity: table.identity, row: cell.row, column: cell.column },
    });
  }
  return checkedInlineObjectSelector(selector);
}
export function checkedCreatedTableReceipt(identity: unknown): string {
  if (
    typeof identity !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(identity) ||
    BigInt(identity) > 0xffffffffffffffffn
  )
    throw Error('InvalidCreatedTableIdentity');
  return identity;
}
