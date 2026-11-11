import { readDocumentModel } from '../document-model.ts';
import { parseObjectReference } from '../object-reference.ts';
import { resolveTableReference } from '../table-reference-resolution.ts';
import type { OperationDocument } from '../types/native-document.ts';
import type { DocumentOperation } from './validate.ts';

export interface SourceTableCellSplitOperation {
  readonly kind: 'source-table-cell-split';
  readonly coordinates: 'current-transaction';
  readonly reference: string;
  readonly expectedRows: number;
  readonly expectedColumns: number;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly rows: number;
  readonly columns: number;
  readonly mode: 'each' | 'merge-then-split';
  readonly equalizeRows: boolean;
}
type Binding = ReturnType<OperationDocument['sdk']['sourceTableCellSplitBinding']>;
type Request = Parameters<OperationDocument['sdk']['splitSourceTableCells']>[0];
const sameBinding = (a: Binding, b: Binding) =>
  a.session === b.session && a.revision === b.revision && a.serial === b.serial;

interface CellBinding {
  paragraph: number;
  tableNode: number;
  listNode: number;
  rows: number;
  columns: number;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  width: number | null;
  height: number | null;
}
function isCellBinding(input: unknown): input is CellBinding {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  const uint = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  return (
    [
      'paragraph',
      'tableNode',
      'listNode',
      'rows',
      'columns',
      'row',
      'column',
      'rowSpan',
      'columnSpan',
    ].every((key) => uint(value[key])) &&
    ['width', 'height'].every((key) => value[key] === null || uint(value[key]))
  );
}
// This observes existing Native DTOs only. Native remains the grid/policy writer.
function observeOwner(
  document: OperationDocument,
  operation: SourceTableCellSplitOperation,
  section: number,
  tableNode: number,
  supportsMergedInput: boolean,
) {
  const placements = document.sdk
    .tablePlacements(section)
    .filter((row) => row.tableNode === tableNode);
  const placement = placements[0];
  if (
    placements.length !== 1 ||
    placement.parentTableNode !== null ||
    placement.parentListNode !== null
  )
    throw new Error('UnsupportedSourceTableSplitOwner');
  const flow = document.sdk.paragraphFlow(section);
  const hosts = flow.filter((row) => row.paragraph === placement.paragraph);
  const host = hosts[0];
  if (
    hosts.length !== 1 ||
    host.host !== 'body' ||
    !host.top_level ||
    host.source_node === null ||
    ('generated' in host && host.generated === true)
  )
    throw new Error('UnsupportedSourceTableSplitOwner');
  const bindings: unknown = document.sdk.tableBindings(section);
  if (!Array.isArray(bindings) || bindings.length > 100000 || !bindings.every(isCellBinding))
    throw new Error('InvalidSourceTableSplitBindings');
  const rows = bindings.filter((row) => row.tableNode === tableNode);
  if (
    !rows.length ||
    rows.some(
      (row) => row.rows !== operation.expectedRows || row.columns !== operation.expectedColumns,
    )
  )
    throw new Error('SourceTableSplitDimensionsMismatch');
  const cells = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const prior = cells.get(row.listNode);
    if (
      prior &&
      ['row', 'column', 'rowSpan', 'columnSpan', 'width', 'height'].some(
        (key) => Reflect.get(prior, key) !== Reflect.get(row, key),
      )
    )
      throw new Error('InvalidSourceTableSplitBindings');
    cells.set(row.listNode, row);
  }
  let selectedCells = 0;
  for (const cell of cells.values()) {
    const bottom = cell.row + cell.rowSpan,
      right = cell.column + cell.columnSpan;
    if (
      bottom <= operation.top ||
      cell.row >= operation.bottom ||
      right <= operation.left ||
      cell.column >= operation.right
    )
      continue;
    if (
      cell.row < operation.top ||
      cell.column < operation.left ||
      bottom > operation.bottom ||
      right > operation.right
    )
      throw new Error('SourceTableSplitPartialCell');
    selectedCells++;
  }
  if (!selectedCells || (operation.mode === 'merge-then-split' && selectedCells < 2))
    throw new Error('InvalidSourceTableSplitSelection');
  if (
    document.format === 'hwp5' &&
    (selectedCells !== 1 ||
      operation.mode !== 'each' ||
      !operation.equalizeRows ||
      (!supportsMergedInput &&
        [...cells.values()].some((cell) => cell.rowSpan !== 1 || cell.columnSpan !== 1)))
  )
    throw new Error('UnsupportedSourceTableSplitSelection');
  return { selectedCells, fingerprint: JSON.stringify({ placement, host, rows }) };
}

/** Resolve all serialized source references BEFORE any mutation. Never resolve a
 * former node number in a changed document, or refresh its ticket after an edit. */
export async function prepareSourceTableCellSplits(
  document: OperationDocument,
  operations: readonly DocumentOperation[],
) {
  const selected = operations.filter((operation) => operation.kind === 'source-table-cell-split');
  const plans = new Map<SourceTableCellSplitOperation, { request: Request; fingerprint: string }>();
  const sdk = document.sdk,
    format = document.format,
    sourceSha256 = document.sourceSha256;
  let binding: Binding | undefined;
  let supportsMergedInput = false;
  const guard = (current: OperationDocument) => {
    if (
      current !== document ||
      current.sdk !== sdk ||
      current.format !== format ||
      current.sourceSha256 !== sourceSha256
    )
      throw new Error('ForeignSourceTableSplitTarget');
    if (!binding || !sameBinding(binding, sdk.sourceTableCellSplitBinding()))
      throw new Error('StaleSourceTableSplitReference');
  };
  if (selected.length) {
    const capability = sdk.sourceTableCellSplitCapabilities();
    if (capability.format !== format) throw new Error('InvalidSourceTableSplitCapabilities');
    supportsMergedInput = capability.supportsMergedInput === true;
    binding = Object.freeze({ ...capability.binding });
    for (const operation of selected) {
      const parsed = parseObjectReference(operation.reference, { format, sourceSha256 });
      if (parsed.kind !== 'table' || parsed.section >= document.sectionCount)
        throw new Error('ExpectedTableReference');
    }
    guard(document);
    const model = await readDocumentModel({
      format,
      sourceSha256,
      sectionCount: document.sectionCount,
      sdk,
    });
    guard(document);
    for (const operation of selected) {
      const resolved = resolveTableReference(
        model,
        operation.reference,
        { format, sourceSha256, sectionCount: document.sectionCount },
        true,
      );
      if (
        resolved.expectedRows !== operation.expectedRows ||
        resolved.expectedColumns !== operation.expectedColumns
      )
        throw new Error('SourceTableSplitDimensionsMismatch');
      const observation = observeOwner(
        document,
        operation,
        resolved.section,
        resolved.tableNode,
        supportsMergedInput,
      );
      guard(document);
      const request: Request = Object.freeze({
        binding,
        section: resolved.section,
        tableNode: resolved.tableNode,
        expectedRows: operation.expectedRows,
        expectedColumns: operation.expectedColumns,
        top: operation.top,
        left: operation.left,
        bottom: operation.bottom,
        right: operation.right,
        selectedCells: observation.selectedCells,
        splitRows: operation.rows,
        splitColumns: operation.columns,
        mode: operation.mode,
        equalizeRows: operation.equalizeRows,
      });
      plans.set(operation, { request, fingerprint: observation.fingerprint });
    }
  }
  return Object.freeze({
    apply(current: OperationDocument, operation: SourceTableCellSplitOperation): null {
      guard(current);
      const plan = plans.get(operation);
      if (!plan) throw new Error('UnissuedSourceTableSplitTarget');
      const now = observeOwner(
        current,
        operation,
        plan.request.section,
        plan.request.tableNode,
        supportsMergedInput,
      );
      guard(current);
      if (now.fingerprint !== plan.fingerprint || now.selectedCells !== plan.request.selectedCells)
        throw new Error('StaleSourceTableSplitReference');
      plans.delete(operation);
      const result = sdk.splitSourceTableCells(plan.request);
      if (
        result.error ||
        ('cleanupError' in result && result.cleanupError) ||
        ('refreshRequired' in result && result.refreshRequired) ||
        !(
          (result.nativeCode === 1 &&
            result.application === 'applied' &&
            result.changed === true) ||
          (result.nativeCode === 2 &&
            result.application === 'unapplied' &&
            result.changed === false)
        )
      )
        throw new Error(result.error || 'SourceTableSplitCompletionUnavailable');
      return null;
    },
  });
}
