/** 원본 BorderFill을 clone하는 명시 intent. shade/table-cell intent와 다릅니다. */
export type BorderLineStyle =
  | 'NONE'
  | 'SOLID'
  | 'DASH'
  | 'DOT'
  | 'DASH_DOT'
  | 'DASH_DOT_DOT'
  | 'LONG_DASH'
  | 'DOUBLE_SLIM'
  | 'SLIM_THICK'
  | 'THICK_SLIM'
  | 'SLIM_THICK_SLIM'
  | 'WAVE'
  | 'DOUBLEWAVE'
  | 'THICK3D'
  | 'THICKREV3D'
  | '3D'
  | 'REV3D';
export interface BorderEdgePatch {
  readonly style?: BorderLineStyle;
  readonly widthHundredthMm?: number;
  readonly color?: number;
}
export interface BorderPatch {
  readonly left?: BorderEdgePatch;
  readonly right?: BorderEdgePatch;
  readonly top?: BorderEdgePatch;
  readonly bottom?: BorderEdgePatch;
}
export type BackgroundPatch =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: number; readonly hatchColor?: number }
  | {
      readonly kind: 'hatch';
      readonly faceColor: number;
      readonly hatchColor: number;
      readonly style:
        | 'HORIZONTAL'
        | 'VERTICAL'
        | 'BACK_SLASH'
        | 'SLASH'
        | 'CROSS'
        | 'CROSS_DIAGONAL';
    }
  | {
      readonly kind: 'linear';
      readonly colors: readonly [number, number];
      readonly angle: number;
      readonly centerX: number;
      readonly centerY: number;
      readonly step: number;
      readonly stepCenter: number;
    };
const styles = new Set<BorderLineStyle>([
  'NONE',
  'SOLID',
  'DASH',
  'DOT',
  'DASH_DOT',
  'DASH_DOT_DOT',
  'LONG_DASH',
  'DOUBLE_SLIM',
  'SLIM_THICK',
  'THICK_SLIM',
  'SLIM_THICK_SLIM',
  'WAVE',
  'DOUBLEWAVE',
  'THICK3D',
  'THICKREV3D',
  '3D',
  'REV3D',
]);
const widths = new Set([10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500]);
const hatch = new Set(['HORIZONTAL', 'VERTICAL', 'BACK_SLASH', 'SLASH', 'CROSS', 'CROSS_DIAGONAL']);
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw Error('InvalidFormattingResource');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw Error(`UnknownFormattingField:${key}`);
}
function integer(value: unknown, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    throw Error('InvalidFormattingResourceValue');
}
function rgb(value: unknown): void {
  integer(value, 0, 0xffffff);
}
export function validateBorderPatch(value: unknown): boolean {
  const border = object(value);
  keys(border, ['left', 'right', 'top', 'bottom']);
  let present = false;
  for (const edge of Object.values(border)) {
    if (edge === undefined) continue;
    const row = object(edge);
    keys(row, ['style', 'widthHundredthMm', 'color']);
    if (row.style !== undefined) {
      if (!styles.has(row.style as BorderLineStyle)) throw Error('UnsupportedBorderLineStyle');
      present = true;
    }
    if (row.widthHundredthMm !== undefined) {
      if (!widths.has(row.widthHundredthMm as number)) throw Error('UnsupportedBorderWidth');
      present = true;
    }
    if (row.color !== undefined) {
      rgb(row.color);
      present = true;
    }
  }
  return present;
}
export function validateBackgroundPatch(value: unknown): void {
  const row = object(value);
  switch (row.kind) {
    case 'none':
      keys(row, ['kind']);
      return;
    case 'solid':
      keys(row, ['kind', 'color', 'hatchColor']);
      rgb(row.color);
      if (row.hatchColor !== undefined) rgb(row.hatchColor);
      return;
    case 'hatch':
      keys(row, ['kind', 'faceColor', 'hatchColor', 'style']);
      rgb(row.faceColor);
      rgb(row.hatchColor);
      if (!hatch.has(row.style as string)) throw Error('UnsupportedBackgroundHatch');
      return;
    case 'linear':
      keys(row, ['kind', 'colors', 'angle', 'centerX', 'centerY', 'step', 'stepCenter']);
      if (!Array.isArray(row.colors) || row.colors.length !== 2)
        throw Error('UnsupportedBackgroundStops');
      for (const color of row.colors) rgb(color);
      integer(row.angle, 0, 359);
      for (const name of ['centerX', 'centerY', 'step', 'stepCenter']) integer(row[name], 0, 100);
      return;
    default:
      throw Error('UnsupportedBackgroundKind');
  }
}

// Derived UI catalogs; the validators above remain the single value source.
export const BORDER_LINE_STYLES = Object.freeze([...styles]);
export const BORDER_WIDTHS_HUNDREDTH_MM = Object.freeze([...widths]);
export const BACKGROUND_HATCH_STYLES = Object.freeze([...hatch]);
