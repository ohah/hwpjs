import { attachHwp5FlowSources } from "./hwp5-flow-content.mjs";
import { attachHwp5ColumnDisplay } from "./hwp5-column-display.mjs";
import { attachHwp5DocumentProperties } from "./hwp5-document-numbering.mjs";
import { attachHwp5AutomaticNumbers } from "./hwp5-automatic-number-content.mjs";
import { attachHwp5PageControls } from "./hwp5-page-control-content.mjs";
import { attachHwp5PageDeclarations } from "./hwp5-page-declaration-content.mjs";
/** Native source declarations, not physical pages or invented paragraph flows. */
export function attachHwp5PageSources(editor, content) {
  attachHwp5PageDeclarations(editor, content);
  if (!editor)
    return attachHwp5PageControls(
      editor,
      attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)),
    );
  return attachHwp5DocumentProperties(
    editor,
    attachHwp5PageControls(
      editor,
      attachHwp5AutomaticNumbers(
        editor,
        attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)),
      ),
    ),
  );
}
