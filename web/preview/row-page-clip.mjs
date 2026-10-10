import { pageVisibleRectangle } from "./page-visible-rectangle.mjs";

// pageClip은 행 로컬 좌표가 아니라 변환 이후의 문서 좌표입니다.
export function rowPageClipContains(row, x, y) {
  if (row.pageClip === undefined) return true;
  const clip = row.pageClip;
  return pageVisibleRectangle(clip, clip).state === "visible" &&
    x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height;
}
