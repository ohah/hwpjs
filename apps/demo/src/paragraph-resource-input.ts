import * as publicCore from '@hwpjs/core';
import type { BorderPatch, BackgroundPatch } from '@hwpjs/core';
export interface InvalidParagraphResourceDraft {
  readonly resourceDraft: 'invalid';
  readonly reason: string;
}
export type ParagraphResourceValue = BorderPatch | BackgroundPatch | InvalidParagraphResourceDraft;
export const resourceEdges = ['left', 'right', 'top', 'bottom'] as const;
// UI 목록과 입력 파서가 공유한다. 최종 쓰기 정책은 기존 core/Native validator다.
const emptyCatalog = Object.freeze([]);
function officialCatalog<T>(name: string): readonly T[] {
  const value = Object.hasOwn(publicCore, name) ? Reflect.get(publicCore, name) : undefined;
  return Array.isArray(value) ? value : emptyCatalog;
}
export const resourceStyles =
  officialCatalog<import('@hwpjs/core').BorderLineStyle>('BORDER_LINE_STYLES');
export const resourceWidths = officialCatalog<number>('BORDER_WIDTHS_HUNDREDTH_MM');
export const resourceHatches =
  officialCatalog<Extract<BackgroundPatch, { kind: 'hatch' }>['style']>('BACKGROUND_HATCH_STYLES');
export const resourceCatalogAvailable = Object.freeze({
  border: resourceStyles.length > 0 && resourceWidths.length > 0,
  background: resourceHatches.length > 0,
});
export function invalidResourceDraft(value: unknown): value is InvalidParagraphResourceDraft {
  return (
    !!value &&
    typeof value === 'object' &&
    'resourceDraft' in value &&
    value.resourceDraft === 'invalid'
  );
}
const invalid = (reason: string): InvalidParagraphResourceDraft => ({
  resourceDraft: 'invalid',
  reason,
});
const color = (raw: string) =>
  /^#[0-9a-f]{6}$/i.test(raw) ? Number.parseInt(raw.slice(1), 16) : null;
export type BorderRaw = Partial<
  Record<(typeof resourceEdges)[number], { style: string; width: string; color: string }>
>;
export function paragraphBorderDraft(raw: BorderRaw): ParagraphResourceValue | undefined {
  const patch: Record<string, unknown> = {};
  for (const edge of resourceEdges) {
    const value = raw[edge];
    if (!value) continue;
    const style = value.style.trim(),
      width = value.width.trim(),
      rgb = value.color.trim();
    if (!style && !width && !rgb) continue;
    const row: Record<string, unknown> = {};
    if (style) {
      if (!(resourceStyles as readonly string[]).includes(style))
        return invalid('선 종류를 확인해주세요.');
      row.style = style;
    }
    if (width) {
      const n = Number(width);
      if (!/^\d+$/.test(width) || !(resourceWidths as readonly number[]).includes(n))
        return invalid('선 굵기를 확인해주세요.');
      row.widthHundredthMm = n;
    }
    if (rgb) {
      const n = color(rgb);
      if (n === null) return invalid('선 색을 #RRGGBB 형식으로 입력하세요.');
      row.color = n;
    }
    patch[edge] = row;
  }
  return Object.keys(patch).length ? (patch as BorderPatch) : undefined;
}
export interface LinearBackgroundRaw {
  endColor: string;
  angle: string;
  centerX: string;
  centerY: string;
  step: string;
  stepCenter: string;
}
export function paragraphBackgroundDraft(
  kind: string,
  raw: string,
  hatch?: { style: string; color: string },
  linear?: LinearBackgroundRaw,
): ParagraphResourceValue | undefined {
  if (!kind && !raw.trim()) return undefined;
  if (kind === 'none') return { kind: 'none' };
  if (kind === 'linear') {
    if (!linear) return invalid('그라데이션 값을 모두 명시해주세요.');
    const start = color(raw.trim()),
      end = color(linear.endColor.trim());
    const names = ['angle', 'centerX', 'centerY', 'step', 'stepCenter'] as const;
    const values = names.map((name) => {
      const text = linear[name].trim();
      return /^\d+$/.test(text) ? Number(text) : NaN;
    });
    if (
      start === null ||
      end === null ||
      values.some(
        (value, index) =>
          !Number.isSafeInteger(value) || value < 0 || value > (index === 0 ? 359 : 100),
      )
    )
      return invalid('선형 배경은 두 색, 각도 0~359, 나머지 정수 0~100을 모두 명시해주세요.');
    return {
      kind: 'linear',
      colors: [start, end],
      angle: values[0],
      centerX: values[1],
      centerY: values[2],
      step: values[3],
      stepCenter: values[4],
    };
  }
  if (kind === 'hatch') {
    const face = color(raw.trim()),
      ink = color(hatch?.color.trim() ?? '');
    if (
      face === null ||
      ink === null ||
      !(resourceHatches as readonly string[]).includes(hatch?.style ?? '')
    )
      return invalid('무늬의 면 색, 선 색, 종류를 모두 명시해주세요.');
    return {
      kind: 'hatch',
      faceColor: face,
      hatchColor: ink,
      style: hatch!.style as Extract<BackgroundPatch, { kind: 'hatch' }>['style'],
    };
  }
  if (kind !== 'solid') return invalid('배경 종류를 명시해주세요.');
  const n = color(raw.trim());
  return n === null
    ? invalid('배경색을 #RRGGBB 형식으로 입력하세요.')
    : { kind: 'solid', color: n };
}
