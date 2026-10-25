import { paragraphReferenceGeometry } from "./paragraph-geometry.mjs";

// TOP/LEFT 문단 시작 앵커는 문단 높이에 의존하지 않습니다. 다른 정렬은 별도 의미 검증이 필요합니다.
export function pictureParagraphPageFragment(picture, paragraph, members, host) {
  const fail = () => ({ state: "unavailable", error: "UnsupportedPictureParagraphPages",
    section: picture.section, paragraph: picture.paragraph, pictureNode: picture.pictureNode,
    anchorPage: host.pageOrdinal, conflictingPage: members.find(row => row.pageOrdinal !== host.pageOrdinal)?.pageOrdinal });
  if (picture.anchorUnit !== 0 || host.startUnit !== 0 || picture.position?.relations?.[2] !== 0
    || picture.position?.relations?.[3] !== 0 || members.some(row => row.transform !== undefined)) return fail();
  let page = -1;
  for (const row of members) {
    if (!Number.isSafeInteger(row.pageOrdinal) || row.pageOrdinal < page) return fail();
    page = row.pageOrdinal;
  }
  const local = members.filter(row => row.pageOrdinal === host.pageOrdinal), column = host.referenceBoxes?.column;
  const valid = box => box && [box.x, box.width, box.x + box.width].every(Number.isFinite) && box.width > 0;
  if (!valid(column) || local.some(row => row.referenceBoxes?.column?.x !== column.x || row.referenceBoxes?.column?.width !== column.width
    || row.columnOrdinal !== host.columnOrdinal)) return fail();
  const geometry = paragraphReferenceGeometry(paragraph.paragraphShape, column.width);
  const box = host.flowParagraphBox ?? { x: column.x + geometry.x, width: geometry.width };
  if (!valid(box) || local.some(row => row.flowParagraphBox !== undefined
    && (row.flowParagraphBox.x !== box.x || row.flowParagraphBox.width !== box.width))) return fail();
  return { state: "selected", members: local, box };
}
