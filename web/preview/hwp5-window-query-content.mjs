import { projectHwp5FieldOwnedWindow } from "./hwp5-window-projection.mjs";
import { attachHwp5WindowObjects } from "./hwp5-window-object-content.mjs";
import { attachHwp5Styles } from "./hwp5-style-content.mjs";
import { attachHwp5ParagraphFormats } from "./hwp5-paragraph-formats.mjs";
import { attachHwp5PageDeclarations } from "./hwp5-page-declaration-content.mjs";
import { attachHwp5WindowColumns } from "./hwp5-window-column-content.mjs";
import { projectHwp5PictureGeometry } from "./hwp5-picture-geometry.mjs";
import { projectHwp5GroupGeometry } from "./hwp5-group-geometry-projection.mjs";
import { projectHwp5RootContent } from "./hwp5-root-content-projection.mjs";
import { validateHwp5WindowSelection } from "./hwp5-window-selection.mjs";
import { attachHwp5WindowStructuralAnchors } from "./hwp5-window-structural-content.mjs";
import { attachHwp5WindowRepeatedAreas } from "./hwp5-window-repeated-content.mjs";
import { attachHwp5WindowNumbering } from "./hwp5-window-numbering-content.mjs";
import { memoHwp5WindowFlows } from "./hwp5-window-flows.mjs";

// Query preparation only; does not change active navigation or edit permission.
export function queryHwp5WindowContent(editor, preview, options, paragraphFormatsAvailable) {
  editor = memoHwp5WindowFlows(editor);
  const content = projectHwp5FieldOwnedWindow(editor, preview, options);
  // Successful extended discovery has already required the optional native ABI.
  content.documentWindowAvailable = true;
  attachHwp5Styles(editor, preview, content);
  attachHwp5ParagraphFormats(editor, content, paragraphFormatsAvailable);
  attachHwp5PageDeclarations(
    editor,
    content,
    new Set(content.paragraphs.map((row) => row.section)),
  );
  attachHwp5WindowObjects(editor, preview, content);
  attachHwp5WindowRepeatedAreas(editor, content);
  attachHwp5WindowStructuralAnchors(editor, content);
  attachHwp5WindowNumbering(editor, content);
  attachHwp5WindowColumns(editor, content);
  content.hwp5GroupGeometry = projectHwp5GroupGeometry(content);
  if (content.hwp5Pictures?.length) {
    const projected = projectHwp5PictureGeometry(content);
    if (projected.state === "projected") content.pictures = projected.pictures;
    else content.hwp5PictureGeometryError = projected.error;
  }
  const roots = projectHwp5RootContent(content);
  if (roots.state === "projected") {
    validateHwp5WindowSelection(roots.content);
    return roots.content;
  }
  content.hwp5WindowRootError = roots.error;
  validateHwp5WindowSelection(content);
  return content;
}
