import { textChange } from "./text-input.mjs";

/** Transient UTF-16 projection shared by anchored display objects. */
export function projectDraftAnchoredObjects(content, objects, draft, stateField = "state") {
  if (!draft) return objects;
  const paragraph = content.paragraphs.find(
    (p) => p.section === draft.section && p.paragraph === draft.paragraph,
  );
  if (!paragraph) return objects;
  const change = textChange(paragraph.text, draft.text);
  if (!change) return objects;
  return (objects ?? []).flatMap((object) => {
    if (
      object.section !== draft.section ||
      object.paragraph !== draft.paragraph ||
      !["located", "reference_located"].includes(object[stateField])
    )
      return [object];
    const unit = object.anchorUnit;
    if (unit >= change.startUnit && unit < change.endUnit) return [];
    const anchorUnit =
      unit >= change.endUnit
        ? unit + change.text.length - (change.endUnit - change.startUnit)
        : unit;
    return draft.text[anchorUnit] === "\ufffc" ? [{ ...object, anchorUnit }] : [];
  });
}
