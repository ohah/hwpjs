import { inlinePictureRowPlacement } from "./inline-picture-row-placement.mjs";
import { pictureVisualBounds } from "./picture-visual-bounds.mjs";

// 비트맵 소유권만 선택합니다. 원본 그림/전체 배치 목록은 바꾸지 않습니다.
export function visiblePictureTargets(index, layers, rows, viewport) {
  const found = new Map();
  const intersects = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
    && box.width > 0 && box.height > 0 && box.x + box.width >= viewport.x && box.x <= viewport.x + viewport.width
    && box.y + box.height >= viewport.y && box.y <= viewport.y + viewport.height;
  const add = picture => found.set(`${picture.section}:${picture.pictureNode}`, { section: picture.section, pictureNode: picture.pictureNode });
  for (const item of [...layers.behind, ...layers.front]) if (intersects(item.visualBounds ?? item)) add(item.picture);
  const byParagraph = new Map();
  for (const item of index.values()) if (item) {
    const id = `${item.picture.section}:${item.picture.paragraph}`, list = byParagraph.get(id) ?? [];
    list.push(item); byParagraph.set(id, list);
  }
  for (const [ordinal, row] of rows.entries()) if (row.kind === "text") {
    for (const item of byParagraph.get(`${row.section}:${row.paragraph}`) ?? []) {
      const placement = inlinePictureRowPlacement(item, row, ordinal);
      if (placement.state === "placed" && intersects(pictureVisualBounds(item.picture, placement.rectangle))) add(item.picture);
    }
  }
  return [...found.values()];
}
