import { placeFloatingPicture } from "./picture-placement.mjs";
import { rowLeft, rowTop, rowHeight, TEXT_TOP, TEXT_LEFT } from "./row-geometry.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { projectGroupedPicturePage } from "./grouped-picture-page-projection.mjs";

// 현재 세로 텍스트 미리보기의 논리 영역입니다. 원본 페이지/다단 영역은 아닙니다.
export function previewPictureLayers(content, layout, columnWidth) {
  const result = { behind: [], front: [], height: layout.height };
  for (const picture of content.pictures ?? []) {
    if (picture.owner && picture.owner.anchorNode !== picture.pictureNode) {
      const grouped = projectGroupedPicturePage(picture, content.containers, content.paragraphs, layout.rows);
      const order = signedInt32(grouped.flow?.z_order);
      if (grouped.state !== "placed" || order === null || ![2, 3].includes(grouped.flow.text_wrap)) continue;
      result[grouped.flow.text_wrap === 2 ? "behind" : "front"].push({ picture, paintPlan: grouped.paintPlan, zOrder: order, ...grouped.rectangle, paintOrigin: grouped.origin });
      result.height = Math.max(result.height, grouped.rectangle.y + grouped.rectangle.height);
      continue;
    }
    const zOrder = signedInt32(picture.flow?.zOrder);
    if (zOrder === null) continue;
    const flowed = layout.flowPictures?.find(item => item.section === picture.section && item.pictureNode === picture.pictureNode);
    const paintPlan = picturePaintPlan(picture);
    if (picture.state !== "located" || paintPlan.state === "unsupported_transform" || !([2, 3].includes(picture.flow?.textWrap) || flowed) || picture.crop?.clip?.length !== 4 || !picture.crop.clip.every(Number.isFinite)) continue;
    const paragraph = content.paragraphs.find(p => p.section === picture.section && p.paragraph === picture.paragraph);
    if (!paragraph || paragraph.tableCell && !flowed || paragraph.clipped || !Number.isInteger(picture.anchorUnit) || paragraph.text?.[picture.anchorUnit] !== "\ufffc") continue;
    const rows = layout.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "text" && row.section === picture.section && row.paragraph === picture.paragraph);
    if (!rows.length) continue;
    // 문단 일부만 레이아웃된 경우 앵커가 보이지 않는 그림을 표시하지 않습니다.
    if (!rows.some(({ row }) => Number.isInteger(row.startUnit) && Number.isInteger(row.endUnit) && row.startUnit <= picture.anchorUnit && picture.anchorUnit < row.endUnit)) continue;
    const first = rows[0], last = rows.at(-1);
    const boxes = {
      column: { x: TEXT_LEFT, y: 0, width: columnWidth, height: layout.height },
      paragraph: { x: rowLeft(first.row), y: rowTop(first.row, first.index) + TEXT_TOP, width: first.row.width, height: rowTop(last.row, last.index) + rowHeight(last.row) - rowTop(first.row, first.index) },
    };
    const placement = flowed ? { state: "placed", rectangle: flowed.rectangle } : placeFloatingPicture(picture, boxes);
    if (placement.state !== "placed") continue;
    const { rectangle } = placement;
    result[picture.flow.textWrap === 2 ? "behind" : "front"].push({ picture, paintPlan, zOrder, ...rectangle });
    result.height = Math.max(result.height, rectangle.y + Math.max(rectangle.height, paintPlan.height ?? 0));
  }
  for (const list of [result.behind, result.front]) list.sort((left, right) => left.zOrder - right.zOrder);
  return result;
}
