import { inlinePictureIndex } from "./picture-inline.mjs";
import { hasPictureSourceErrors, hasFinitePictureCrop } from "./picture-source-validation.mjs";

// 도형 내부 그림을 제거된 본문 문단의 그림으로 전달하지 않습니다.
export function drawingPictureScope(content, bodyParagraphs) {
  const fail = error => ({ state: "unavailable", error });
  const bodyPictures = [], localPictures = [], localIds = new Set();
  for (const picture of content.pictures ?? []) {
    if (picture.owner?.anchorNode !== picture.pictureNode) continue;
    const owners = content.paragraphs.filter(p => p.section === picture.section && p.paragraph === picture.paragraph);
    if (owners.length !== 1) return fail("AmbiguousDrawingPictureOwner");
    const paragraph = owners[0];
    if (paragraph.drawingText || paragraph.drawingCaption) {
      if (picture.geometry?.treatAsCharacter !== true) return fail("UnsupportedDrawingLocalFloatingPicture");
      if (picture.caption != null) return fail("UnsupportedDrawingLocalPictureCaption");
      if (hasPictureSourceErrors(picture) || !hasFinitePictureCrop(picture)) return fail("InvalidDrawingLocalPicture");
      const key = `${picture.section}:${picture.pictureNode}`;
      if (localIds.has(key)) return fail("AmbiguousDrawingPictureOwner");
      localIds.add(key); localPictures.push(picture);
    } else if (bodyParagraphs.includes(paragraph) && (picture.geometry?.treatAsCharacter === true || paragraph.tableCell)) bodyPictures.push(picture);
  }
  const inlineIndex = inlinePictureIndex({ paragraphs: content.paragraphs, pictures: localPictures });
  if (inlineIndex.size !== localPictures.length || [...inlineIndex.values()].some(item => !item)) return fail("InvalidDrawingLocalPicture");
  return { state: "scoped", bodyPictures, localIds, inlineIndex };
}
