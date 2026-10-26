import { projectDraftAnchoredObjects } from "./anchored-object-draft.mjs";

// 임시 입력의 위치만 투영합니다. 원본 그림과 native 문서 값은 변경하지 않습니다.
export function projectDraftPictures(content, draft) {
  if (!draft) return content.pictures;
  const grouped = new Map();
  const adapted = (content.pictures ?? []).map((picture) => {
    if (!picture.owner || picture.owner.anchorNode === picture.pictureNode) return picture;
    grouped.set(`${picture.section}:${picture.pictureNode}`, picture);
    return {
      ...picture,
      paragraph: picture.owner.paragraph,
      anchorUnit: picture.owner.anchorUnit,
      state: "located",
    };
  });
  return projectDraftAnchoredObjects(content, adapted, draft).map((picture) => {
    const original = grouped.get(`${picture.section}:${picture.pictureNode}`);
    return original
      ? {
          ...picture,
          state: original.state,
          anchorUnit: original.anchorUnit,
          owner: { ...original.owner, anchorUnit: picture.anchorUnit },
        }
      : picture;
  });
}
