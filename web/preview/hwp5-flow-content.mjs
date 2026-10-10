import { attachHwp5StructuralAnchors } from "./hwp5-structural-anchor-content.mjs";
import { attachHwp5PageAreas } from "./hwp5-page-area-content.mjs";
import { attachHwp5MasterPages } from "./hwp5-master-page-content.mjs";
import { attachHwp5Notes } from "./hwp5-note-content.mjs";
import { attachHwp5Captions } from "./hwp5-caption-content.mjs";
import { attachHwp5Drawings } from "./hwp5-drawing-content.mjs";
/** Current native flow, distinct from source declaration and physical page layout. */
export function attachHwp5FlowSources(editor, content) {
  content.currentParagraphFlows = [];
  content.columnSources = [];
  content.flowSourceErrors = [];
  if (!editor) return attachHwp5Drawings(editor, attachHwp5Captions(editor, attachHwp5Notes(editor, attachHwp5MasterPages(editor, attachHwp5PageAreas(editor, attachHwp5StructuralAnchors(editor, content))))));
  for (let section = 0; section < editor.sectionCount(); section++) {
    try {
      const flows = editor.paragraphFlow(section), columns = editor.columnSources(section);
      for (const declaration of columns) {
        const owner = flows[declaration.current_paragraph];
        if (!owner || owner.generated || owner.source_node !== declaration.paragraph_node) throw new Error("ColumnSourceBindingMismatch");
      }
      content.currentParagraphFlows.push(...flows.map(row => ({ ...row, section })));
      content.columnSources.push(...columns.map(row => ({ ...row, section })));
    } catch (error) { content.flowSourceErrors.push({ section, error: error.message }); }
  }
  return attachHwp5Drawings(editor, attachHwp5Captions(editor, attachHwp5Notes(editor, attachHwp5MasterPages(editor, attachHwp5PageAreas(editor, attachHwp5StructuralAnchors(editor, content))))));
}
