// One display response owns this lookup. Never keep it across edits or history.
export function createFormulaResultDisplayLookup(editor, exports) {
  const available =
    exports.has("hwpx_edit_manual_formula_result_display_snapshot") &&
    typeof editor.manualFormulaResultDisplaySnapshot === "function";
  const sections = new Map();
  return {
    available,
    get(section, paragraph) {
      if (!available) throw new Error("HwpxFormulaResultSnapshotAbiUnavailable");
      if (!sections.has(section)) {
        let rows;
        try {
          rows = editor.manualFormulaResultDisplaySnapshot(section);
        } catch (error) {
          // Optional aggregate budgets must not make a bounded legacy view fail.
          if (error.message !== "LimitExceeded") throw error;
          sections.set(section, null);
          return undefined;
        }
        const current = new Map();
        for (const row of rows) {
          if (current.has(row.paragraph)) throw new Error("InvalidFormulaResultDisplaySnapshot");
          current.set(row.paragraph, row);
        }
        sections.set(section, current);
      }
      return (
        sections.get(section)?.get(paragraph) ?? (sections.get(section) === null ? undefined : null)
      );
    },
  };
}
