import { validateHwp5FormProperties } from "../../js/hwp5-form-properties.mjs";

/** Attach raw native properties without granting display, edit or command execution. */
export function attachHwp5FormProperties(editor, content) {
  content.hwp5FormPropertiesAvailable = editor?.supportsFormProperties?.() === true;
  content.hwp5FormPropertyErrors = [];
  for (const form of content.hwp5Forms ?? []) form.properties = null;
  if (!content.hwp5FormPropertiesAvailable) return;
  const sections = new Map();
  for (const form of content.hwp5Forms ?? []) {
    const rows = sections.get(form.section) ?? [];
    rows.push(form);
    sections.set(form.section, rows);
  }
  for (const [section, forms] of sections) {
    try {
      const properties = validateHwp5FormProperties(editor.formProperties(section));
      const byControl = new Map(properties.map((row) => [row.control_node, row]));
      if (properties.length !== forms.length) throw Error("IncompleteHwp5FormProperties");
      const selected = forms.map((form) => {
        const row = byControl.get(form.controlNode);
        if (
          !row ||
          row.object_node !== form.formNode ||
          row.known_nodes + row.deferred_nodes !== form.source.property_nodes
        )
          throw Error("MismatchedHwp5FormProperties");
        return row;
      });
      forms.forEach((form, index) => {
        form.properties = selected[index];
      });
    } catch (error) {
      content.hwp5FormPropertyErrors.push({ section, error: error.message });
    }
  }
}
