import {cellTextAtBoundaryPoint} from "./table-boundary-text-hit.mjs";

// 실제 표 셀 배치의 외곽과 현재 보호 앵커를 연결합니다.
export function tableBoundaryFrames(layout) {
  const frames = [], anchors = new Map(), groups = new Map();
  for (const anchor of layout.tableAnchors ?? []) {
    if (![anchor.section, anchor.tableNode, anchor.hostParagraph, anchor.anchorUnit].every(value => Number.isSafeInteger(value) && value >= 0) || anchor.anchorUnit === Number.MAX_SAFE_INTEGER) continue;
    const key = `${anchor.section}:${anchor.tableNode}`;
    anchors.set(key, anchors.has(key) ? null : anchor);
  }
  for (const box of layout.boxes ?? []) {
    const anchor = anchors.get(`${box.section}:${box.tableNode}`);
    if (!anchor || !Number.isSafeInteger(box.pageOrdinal) || box.pageOrdinal < 0) continue;
    const key = `${box.section}:${box.tableNode}:${box.pageOrdinal}`;
    const group = groups.get(key) ?? { anchor, pageOrdinal: box.pageOrdinal, valid: true, x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity };
    groups.set(key, group);
    if (![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) { group.valid = false; continue; }
    group.x = Math.min(group.x, box.x); group.y = Math.min(group.y, box.y);
    group.right = Math.max(group.right, box.x + box.width); group.bottom = Math.max(group.bottom, box.y + box.height);
  }
  for (const group of groups.values()) {
    const width = group.right - group.x, height = group.bottom - group.y;
    if (!group.valid || ![width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    frames.push({ ...group.anchor, pageOrdinal: group.pageOrdinal, rectangle: { x: group.x, y: group.y, width, height } });
  }
  return frames;
}

export function hitTableBoundary(layout, x, y, paragraphAt, target = null) {
  if (![x, y].every(Number.isFinite)) return null;
  for (const frame of tableBoundaryFrames(layout).toReversed()) {
    if (target && (target.section !== frame.section || target.paragraph !== frame.hostParagraph)) continue;
    const box = frame.rectangle, right = box.x + box.width, bottom = box.y + box.height;
    if (x < box.x - 4 || x > right + 4 || y < box.y - 4 || y > bottom + 4 || Math.min(Math.abs(x - box.x), Math.abs(x - right), Math.abs(y - box.y), Math.abs(y - bottom)) > 4) continue;
    if (cellTextAtBoundaryPoint(layout,x,y)) return null;
    const paragraph = paragraphAt({ section: frame.section, paragraph: frame.hostParagraph });
    if (paragraph?.editable !== true || paragraph.text?.[frame.anchorUnit] !== "\ufffc") continue;
    const after = x >= box.x + box.width / 2;
    return { section: frame.section, paragraph: frame.hostParagraph, unit: frame.anchorUnit + Number(after), affinity: after ? "backward" : "forward", tableNode: frame.tableNode, pageOrdinal: frame.pageOrdinal };
  }
  return null;
}

export function tableBoundaryCaret(layout, point) {
  let candidates = tableBoundaryFrames(layout).filter(frame => frame.section === point.section && frame.hostParagraph === point.paragraph
    && (point.tableNode === undefined || point.tableNode === frame.tableNode) && (point.pageOrdinal === undefined || point.pageOrdinal === frame.pageOrdinal)
    && (point.unit === frame.anchorUnit || point.unit === frame.anchorUnit + 1));
  if (point.pageOrdinal === undefined) {
    const objects = new Map();
    for (const frame of candidates) {
      const previous = objects.get(frame.tableNode);
      if (!previous || (point.unit === frame.anchorUnit ? frame.pageOrdinal < previous.pageOrdinal : frame.pageOrdinal > previous.pageOrdinal)) objects.set(frame.tableNode, frame);
    }
    candidates = [...objects.values()];
  }
  const frame = point.affinity === "backward" ? candidates[0] : candidates.at(-1);
  if (!frame) return null;
  const box = frame.rectangle;
  return { x: box.x + (point.unit === frame.anchorUnit ? 0 : box.width), y: box.y, height: box.height, row: -1 };
}
