import type { CanvasPageGeometry } from '@hwpjs/vanilla';
// Same physical CSS-pixel conversion used by the page compositor.
// @ts-ignore Canonical HWP units.
import { hwpUnitPixels } from '../../../web/preview/hwp-units.mjs';
const pixelsPerMM = hwpUnitPixels(7200) / 25.4;
export function pageRulerModel(value: CanvasPageGeometry | null | undefined) {
  if (!value) return null;
  const { paper, page, scale } = value;
  const widthMM = paper.width / pixelsPerMM,
    heightMM = paper.height / pixelsPerMM;
  const leftMM = (page.x - paper.x) / pixelsPerMM;
  const rightMM = (paper.x + paper.width - page.x - page.width) / pixelsPerMM;
  if (
    ![
      widthMM,
      heightMM,
      leftMM,
      rightMM,
      scale,
      value.paperLeft,
      value.viewportLeft,
      value.viewportWidth,
    ].every(Number.isFinite) ||
    Math.min(widthMM, heightMM, scale, value.viewportWidth) <= 0 ||
    leftMM < 0 ||
    rightMM < -1e-6 ||
    widthMM > 10000
  )
    return null;
  const ticks = [];
  for (let mm = 0; mm <= Math.floor(widthMM); mm++) {
    // Keep minor marks readable at 50%, while preserving physical centimetres.
    if (scale < 0.75 && mm % 2 && mm % 5) continue;
    ticks.push({
      x: mm * pixelsPerMM * scale,
      major: mm % 10 === 0,
      medium: mm % 5 === 0,
      label: mm % 10 === 0 ? String(mm / 10) : '',
    });
  }
  const mm = (n: number) => Number(n.toFixed(1));
  return {
    ...value,
    width: paper.width * scale,
    leftMargin: (page.x - paper.x) * scale,
    rightMargin: Math.max(0, (paper.x + paper.width - page.x - page.width) * scale),
    ticks,
    label: `${value.partial ? '부분 미리보기 ' : ''}${value.current}쪽 · ${mm(widthMM)} × ${mm(heightMM)} mm · ${widthMM > heightMM ? '가로' : '세로'} · 왼쪽 ${mm(leftMM)} / 오른쪽 ${mm(rightMM)} mm · cm 눈금`,
  };
}
