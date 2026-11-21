export interface ChartGridData {
  readonly values: {
    readonly points: readonly { readonly kind: string; readonly value: string }[];
  };
}
export interface ChartGridModel {
  readonly columns: readonly { readonly label: string }[];
  readonly rows: readonly {
    readonly index: number;
    readonly cells: ReadonlyMap<number, readonly number[]>;
  }[];
  readonly locations: ReadonlyMap<
    number,
    { readonly index: number; readonly row: number; readonly column: number }
  >;
}
export function createChartPointGrid(options: {
  head: HTMLElement;
  body: HTMLElement;
  previousRows: HTMLButtonElement;
  nextRows: HTMLButtonElement;
  previousColumns: HTMLButtonElement;
  nextColumns: HTMLButtonElement;
  note: HTMLElement;
  getChart(): ChartGridData | null | undefined;
  projectModel?(chart: ChartGridData | null | undefined): ChartGridModel;
  rowLabel?: string;
  getSelected(): number | null | undefined;
  getDraft?(id: number): string | undefined;
  accepts(kind: string): boolean;
  ready(): boolean;
  select(id: number): void;
}): { refresh(): void; reveal(): void; close(): void };
