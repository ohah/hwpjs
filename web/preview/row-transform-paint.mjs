import { inverseAffine } from "./affine-point-geometry.mjs";
import { pageVisibleRectangle } from "./page-visible-rectangle.mjs";

// 기존 그리기 함수는 이미 scrollTop을 뺀 좌표를 사용합니다.
export function paintRowTransform(ctx, row, scrollTop, paint) {
  if (!Number.isFinite(scrollTop) || typeof paint !== "function") return false;
  const clip = row.pageClip;
  if (clip !== undefined && pageVisibleRectangle(clip, clip).state !== "visible") return false;
  if (row.transform === undefined && clip === undefined) { paint(); return true; }
  if (row.transform !== undefined && !inverseAffine(row.transform)) return false;
  ctx.save();
  try {
    if (clip !== undefined) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y - scrollTop, clip.width, clip.height);
      ctx.clip();
    }
    if (row.transform !== undefined) {
      ctx.translate(0, -scrollTop);
      ctx.transform(...row.transform);
      ctx.translate(0, scrollTop);
    }
    paint();
  } finally { ctx.restore(); }
  return true;
}
