export type CellInsetsPatch = Readonly<
  | { mode: 'inherit' }
  | { mode: 'custom'; left?: number; right?: number; top?: number; bottom?: number }
>;
export interface CellInsetsValue {
  readonly mode: 'inherit' | 'custom';
  readonly effective: readonly [number, number, number, number];
  readonly tableDefaults: readonly [number, number, number, number];
  readonly frame: Readonly<{ width: number; height: number }>;
}
