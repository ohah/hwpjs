import { placeFloatingPicture } from "./picture-placement.mjs";
import { rowLeft, rowTop, rowHeight } from "./row-geometry.mjs";

// 현재 문단의 완전한 단일 페이지 행만 PARA 기준 영역으로 사용합니다.
export function projectFloatingPicturePage(picture, paragraphs, rows, options) {
  const unavailable = error => ({ state: "unavailable", error });
  if (picture?.state !== "located" || !Array.isArray(paragraphs) || !Array.isArray(rows)) return unavailable("InvalidPicturePageAnchor");
  const owners = paragraphs.filter(p => p.section === picture.section && p.paragraph === picture.paragraph);
  if (owners.length !== 1 || typeof owners[0].text !== "string" || !Number.isSafeInteger(picture.anchorUnit) || picture.anchorUnit < 0 || owners[0].text[picture.anchorUnit] !== "\ufffc") return unavailable("InvalidPicturePageAnchor");
  const members = rows.filter(row => row.kind === "text" && row.section === picture.section && row.paragraph === picture.paragraph).toSorted((a, b) => a.startUnit - b.startUnit);
  const hosts = members.filter(row => row.startUnit <= picture.anchorUnit && picture.anchorUnit < row.endUnit);
  if (hosts.length !== 1) return unavailable("AmbiguousPicturePageAnchor");
  const host = hosts[0];
  if (!Number.isSafeInteger(host.pageOrdinal) || host.pageOrdinal < 0) return unavailable("MissingPicturePageReference");
  const boxes = { ...host.referenceBoxes };
  if (picture.position?.relations?.[0] === 2 || picture.position?.relations?.[1] === 3) {
    let end = 0;
    for (const row of members) {
      if (row.pageOrdinal !== host.pageOrdinal || row.transform !== undefined) return unavailable("UnsupportedPictureParagraphPages");
      if (row.startUnit !== end || !Number.isSafeInteger(row.endUnit) || row.endUnit <= end) return unavailable("IncompletePictureParagraphRows");
      end = row.endUnit;
      if (![rowLeft(row), row.y, row.width, row.height].every(Number.isFinite) || row.width < 0 || row.height <= 0) return unavailable("InvalidPictureParagraphBounds");
    }
    if (end !== owners[0].text.length) return unavailable("IncompletePictureParagraphRows");
    const originalBox = host.flowParagraphBox;
    if (originalBox !== undefined && (!originalBox || ![originalBox.x, originalBox.width, originalBox.x + originalBox.width].every(Number.isFinite) || originalBox.width <= 0 || members.some(row => row.flowParagraphBox?.x !== originalBox.x || row.flowParagraphBox?.width !== originalBox.width))) return unavailable("InvalidPictureParagraphBounds");
    const x = originalBox?.x ?? Math.min(...members.map(rowLeft));
    const topAligned = picture.position.relations[2] === 0;
    if (topAligned && members.some(row => row.flowAnchorY !== undefined && !Number.isFinite(row.flowAnchorY))) return unavailable("InvalidPictureParagraphBounds");
    const y = Math.min(...members.map((row, index) => topAligned ? row.flowAnchorY ?? rowTop(row, index) : rowTop(row, index)));
    boxes.paragraph = { x, y, width: originalBox?.width ?? Math.max(...members.map(row => rowLeft(row) + row.width)) - x,
      height: Math.max(...members.map((row, index) => rowTop(row, index) + rowHeight(row))) - y };
  }
  const placement = placeFloatingPicture(picture, boxes, options);
  return placement.state === "placed" ? { ...placement, pageOrdinal: host.pageOrdinal, referenceBoxes: boxes } : unavailable(placement.state);
}
