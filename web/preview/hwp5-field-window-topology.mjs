import { validateHwp5FieldSpans } from "../../js/hwp5-field-spans.mjs";
import { validateHwp5FieldTopology } from "../../js/hwp5-field-topology.mjs";

// Display discovery only: never replace strict field bindings for transactions.
export function readHwp5WindowFields(editor, section) {
  try {
    return { spans: validateHwp5FieldSpans(editor.fieldSpans(section)), unresolved: [] };
  } catch (error) {
    if (
      error?.message !== "UnsupportedCrossParagraphField" ||
      editor.supportsFieldTopology?.() !== true
    )
      throw error;
    const report = validateHwp5FieldTopology(editor.fieldTopology(section));
    if (report.unresolved.length === 0) throw error;
    return report;
  }
}
