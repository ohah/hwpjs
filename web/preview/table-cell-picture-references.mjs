import { pictureReferenceSpace } from "./picture-reference-space.mjs";

// Reference selection belongs to the compositor. Measurement accepts explicit
// per-cell local boxes, never infers COLUMN from a viewport or another cell.
export function tableCellPictureReferences(provider, input) {
  const references = typeof provider === "function" ? provider(input) : provider;
  if (references == null) return { state: "resolved", references };
  const fail = () => ({ state: "unavailable", error: "InvalidTableCellPictureReferences" });
  if (typeof references !== "object" || Array.isArray(references)) return fail();
  const validated = pictureReferenceSpace(references, { x: 0, y: 0 });
  if (validated.state !== "mapped") return fail();
  return { state: "resolved", references: validated.boxes };
}
