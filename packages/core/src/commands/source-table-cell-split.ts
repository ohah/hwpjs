declare const splitTarget: unique symbol;
export interface SourceTableCellSplitTarget {
  readonly [splitTarget]: true;
}
export interface SourceTableCellSplitSelection {
  readonly selectedCells: number;
  readonly rows: number;
  readonly columns: number;
}
export interface SourceTableCellSplitCapture {
  readonly target: SourceTableCellSplitTarget;
  readonly selection: SourceTableCellSplitSelection;
}
export interface SplitSourceTableCellsPayload {
  readonly target: SourceTableCellSplitTarget;
  readonly rows: number;
  readonly columns: number;
  readonly mode: 'each' | 'merge-then-split';
  readonly equalizeRows: boolean;
}
export function captureSourceTableCellSplitPayload(input: unknown): SplitSourceTableCellsPayload {
  if (
    !input ||
    typeof input !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw Error('InvalidSourceTableSplitRequest');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = ['target', 'rows', 'columns', 'mode', 'equalizeRows'];
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some(
      (key) => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'),
    )
  )
    throw Error('InvalidSourceTableSplitRequest');
  const value = Object.fromEntries(
    keys.map((key) => [key, descriptors[key].value]),
  ) as unknown as SplitSourceTableCellsPayload;
  if (
    !value.target ||
    typeof value.target !== 'object' ||
    !Number.isInteger(value.rows) ||
    !Number.isInteger(value.columns) ||
    value.rows < 1 ||
    value.rows > 63 ||
    value.columns < 1 ||
    value.columns > 63 ||
    (value.rows === 1 && value.columns === 1) ||
    !['each', 'merge-then-split'].includes(value.mode) ||
    typeof value.equalizeRows !== 'boolean'
  )
    throw Error('InvalidSourceTableSplitRequest');
  return Object.freeze(value);
}
