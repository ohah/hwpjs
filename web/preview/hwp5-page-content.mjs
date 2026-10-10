import { attachHwp5FlowSources } from "./hwp5-flow-content.mjs";
import { attachHwp5ColumnDisplay } from "./hwp5-column-display.mjs";
import { attachHwp5DocumentProperties } from "./hwp5-document-numbering.mjs";
import { attachHwp5AutomaticNumbers } from "./hwp5-automatic-number-content.mjs";
import { attachHwp5PageControls } from "./hwp5-page-control-content.mjs";
/** Native source declarations, not physical pages or invented paragraph flows. */
export function attachHwp5PageSources(editor, content) {
  content.pageSources = [];
  content.pageSourceErrors = [];
  content.sectionSources = [];
  content.sectionSourceErrors = [];
  if (!editor) return attachHwp5PageControls(editor, attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)));
  for (let section = 0; section < editor.sectionCount(); section++) {
    try {
      const setting = editor.sectionSettings(section);
      let fileVersion;
      try { fileVersion = editor.fileVersion?.(); }
      catch (error) { if (error.message !== "Hwp5FileVersionAbiUnavailable") throw error; }
      content.sectionSources.push({ section, ...setting, ...(fileVersion === undefined ? {} : { fileVersion }) });
    }
    catch (error) { content.sectionSourceErrors.push({ section, error: error.message }); }
    try {
      content.pageSources.push({ section, ...editor.pageSettings(section) });
    } catch (error) {
      content.pageSourceErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5DocumentProperties(editor, attachHwp5PageControls(editor, attachHwp5AutomaticNumbers(editor, attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)))));
}
