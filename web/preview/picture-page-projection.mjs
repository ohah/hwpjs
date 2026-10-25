import { placeFloatingPicture } from "./picture-placement.mjs";
import { rowLeft, rowTop, rowHeight } from "./row-geometry.mjs";
import { pictureParagraphPageFragment } from "./picture-paragraph-page-fragment.mjs";

// 전체 원문 구간을 확인한 뒤 허용된 문단 페이지 조각으로 PARA 기준을 정합니다.
export function projectFloatingPicturePage(picture, paragraphs, rows, options) {
  const unavailable = error => ({ state: "unavailable", error });
  if (picture?.state !== "located" || !Array.isArray(paragraphs) || !Array.isArray(rows)) return unavailable("InvalidPicturePageAnchor");
  const owners = paragraphs.filter(p => p.section === picture.section && p.paragraph === picture.paragraph);
  if (owners.length !== 1 || typeof owners[0].text !== "string" || !Number.isSafeInteger(picture.anchorUnit) || picture.anchorUnit < 0 || owners[0].text[picture.anchorUnit] !== "\ufffc") return unavailable("InvalidPicturePageAnchor");
  const members = rows.filter(row => row.kind === "text" && row.section === picture.section && row.paragraph === picture.paragraph).toSorted((a, b) => a.startUnit - b.startUnit);
  const hosts = members.filter(row => row.startUnit <= picture.anchorUnit && picture.anchorUnit < row.endUnit);
  if (hosts.length !== 1) return unavailable("AmbiguousPicturePageAnchor");
  const host = hosts[0];
  const invalidBounds = stage => ({ ...unavailable("InvalidPictureParagraphBounds"), section: picture.section,
    paragraph: picture.paragraph, pictureNode: picture.pictureNode, paragraphValidationStage: stage });
  if (!Number.isSafeInteger(host.pageOrdinal) || host.pageOrdinal < 0) return unavailable("MissingPicturePageReference");
  const boxes = { ...host.referenceBoxes };
  if (picture.position?.relations?.[0] === 2 || picture.position?.relations?.[1] === 3) {
    const split = members.some(row => row.pageOrdinal !== host.pageOrdinal);
    const fragment = split ? pictureParagraphPageFragment(picture, owners[0], members, host) : null;
    if (fragment && fragment.state !== "selected") return fragment;
    let end = 0;
    for (const row of members) {
      if ((!split && row.pageOrdinal !== host.pageOrdinal) || row.transform !== undefined) return { ...unavailable("UnsupportedPictureParagraphPages"),
        section: picture.section, paragraph: picture.paragraph, pictureNode: picture.pictureNode,
        anchorPage: host.pageOrdinal, conflictingPage: row.pageOrdinal, transformed: row.transform !== undefined };
      if (row.startUnit !== end || !Number.isSafeInteger(row.endUnit) || row.endUnit <= end) return unavailable("IncompletePictureParagraphRows");
      end = row.endUnit;
      if (![rowLeft(row), row.y, row.width, row.height].every(Number.isFinite) || row.width < 0 || row.height <= 0) return invalidBounds("row-geometry");
    }
    if (end !== owners[0].text.length) return unavailable("IncompletePictureParagraphRows");
    const pageMembers = fragment?.members ?? members;
    const originalBox = fragment?.box ?? host.flowParagraphBox;
    if (originalBox !== undefined && (!originalBox || ![originalBox.x, originalBox.width, originalBox.x + originalBox.width].every(Number.isFinite) || originalBox.width <= 0 || (!split && members.some(row => row.flowParagraphBox?.x !== originalBox.x || row.flowParagraphBox?.width !== originalBox.width)))) return invalidBounds("paragraph-reference-box");
    const x = originalBox?.x ?? Math.min(...pageMembers.map(rowLeft));
    const topAligned = picture.position.relations[2] === 0;
    if (topAligned && members.some(row => row.flowAnchorY !== undefined && !Number.isFinite(row.flowAnchorY))) return invalidBounds("anchor-origin");
    const y = Math.min(...pageMembers.map((row, index) => topAligned ? row.flowAnchorY ?? rowTop(row, index) : rowTop(row, index)));
    boxes.paragraph = { x, y, width: originalBox?.width ?? Math.max(...pageMembers.map(row => rowLeft(row) + row.width)) - x,
      height: Math.max(...pageMembers.map((row, index) => rowTop(row, index) + rowHeight(row))) - y };
  }
  const placement = placeFloatingPicture(picture, boxes, options);
  return placement.state === "placed" ? { ...placement, pageOrdinal: host.pageOrdinal, referenceBoxes: boxes } : unavailable(placement.state);
}
