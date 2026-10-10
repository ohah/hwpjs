import { placeFloatingPicture } from "./picture-placement.mjs";
import { pictureParagraphFlow } from "./picture-paragraph-flow.mjs";
import { TEXT_TOP, TEXT_LEFT, DEFAULT_ROW_HEIGHT } from "./row-geometry.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";

// 현재 논리 단/문단 기준의 그림만 연결합니다. 종이·페이지 기준은 보정하지 않습니다.
export function paragraphPictureFlow(content, paragraph, width, y, measure, maxLines, previousPictures = [], context = null) {
  if (paragraph.clipped || maxLines < 1) return null;
  const cell = paragraph.tableCell;
  if (cell && (!context?.cell || context.cell.tableNode !== cell.tableNode || context.cell.listNode !== cell.listNode)) return null;
  const pictures = previousPictures.filter(picture => picture.section === paragraph.section && (cell ? picture.cell?.tableNode === cell.tableNode && picture.cell?.listNode === cell.listNode : !picture.cell));
  const added = [];
  for (const picture of content.pictures ?? []) {
    if (picture.section !== paragraph.section || picture.paragraph !== paragraph.paragraph || picture.state !== "located" || picturePaintPlan(picture).state === "unsupported_transform" || ![0, 1].includes(picture.flow?.textWrap)) continue;
    if (signedInt32(picture.flow.zOrder) === null) continue;
    if (!Number.isInteger(picture.anchorUnit) || paragraph.text[picture.anchorUnit] !== "\ufffc" || picture.crop?.clip?.length !== 4 || !picture.crop.clip.every(Number.isFinite)) continue;
    // 세로 중앙/끝 정렬은 문단 높이와 상호 의존하므로 별도 수렴 계산이 필요합니다.
    if (picture.position?.relations?.[2] !== 0) continue;
    if (cell && picture.position.relations[1] === 2 && !context.references?.column) continue;
    const box = { x: TEXT_LEFT, y: y + paragraphSpacePixels(paragraph.paragraphShape?.before) + TEXT_TOP, width, height: DEFAULT_ROW_HEIGHT };
    const placement = placeFloatingPicture(picture, { column: cell ? undefined : { x: TEXT_LEFT, y: 0, width, height: 0 }, ...context?.references, paragraph: box });
    if (placement.state === "placed") {
      const item = { rectangle: placement.rectangle, flow: picture.flow, pictureNode: picture.pictureNode, section: picture.section, paragraph: picture.paragraph, ...(cell ? { cell: { tableNode: cell.tableNode, listNode: cell.listNode } } : {}) };
      pictures.push(item); added.push(item);
    }
  }
  if (!pictures.length) return null;
  const flow = pictureParagraphFlow(paragraph.text, { x: TEXT_LEFT, y, width }, pictures, (text, unit) => measure(text, paragraph, unit, "text"), { paragraphShape: paragraph.paragraphShape, maxLines });
  if (flow.state !== "complete") return null;
  return { ...flow, pictures: added };
}
