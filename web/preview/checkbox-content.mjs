// Native owns current locations, state and source metadata; no XML heuristics.
export function attachCheckBoxes(editor, content, available) {
  content.checkBoxStateAvailable = available;
  content.checkBoxes = [];
  if (!available) return;
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    for (const site of editor.formSites(section)) {
      if (site.kind !== "check_button") continue;
      const row = { section, formNode: site.formNode, paragraph: site.paragraph === null ? null : site.paragraph - 1, anchorUnit: site.anchorUnit, siteState: site.state, caption: null, state: null, editable: false, triState: false, error: null };
      row.sourceLayout = null; row.layoutError = null;
      if (typeof editor.formSourceLayout === "function") {
        try { row.sourceLayout = editor.formSourceLayout(section, site.formNode); }
        catch (error) { row.layoutError = error.message; }
      } else row.layoutError = "HwpxFormLayoutAbiUnavailable";
      try {
        const source = editor.formSourceAttributes(section, site.formNode);
        row.caption = source.strings.caption ?? source.strings.name;
        row.foreColor = source.strings.foreColor ?? null;
        row.backColor = source.strings.backColor ?? null;
        row.backStyle = source.strings.backStyle ?? null;
        row.triState = source.booleans.triState === true;
        if (site.state === "located") {
          row.state = editor.checkBoxState(section, site.formNode);
          row.editable = source.booleans.enabled === true && source.booleans.editable === true;
        } else row.error = site.state;
      } catch (error) { row.error = error.message; }
      content.checkBoxes.push(row);
    }
  }
}
