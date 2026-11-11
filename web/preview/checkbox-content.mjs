// Native owns current locations, state and source metadata; no XML heuristics.
export function attachCheckBoxes(editor, content, available) {
  content.checkBoxStateAvailable = available;
  content.checkBoxes = [];
  content.formTexts = [];
  content.hwpxFormTextEditAvailable =
    editor.supportsFormTextEdit?.() === true && editor.supportsFormTextLayoutRetention?.() === true;
  if (!available) return;
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    const readSection = () => {
      for (const site of editor.formSites(section)) {
        const radio = site.kind === 'radio_button',
          text = ['edit_box', 'combo_box'].includes(site.kind);
        if (site.kind !== 'check_button' && !radio && !text) continue;
        const row = {
          format: 'hwpx',
          kind: site.kind,
          section,
          formNode: site.formNode,
          paragraph: site.paragraph === null ? null : site.paragraph - 1,
          anchorUnit: site.anchorUnit,
          siteState: site.state,
          caption: null,
          state: null,
          editable: false,
          triState: false,
          error: null,
        };
        row.sourceLayout = null;
        row.layoutError = null;
        if (typeof editor.formSourceLayout === 'function') {
          try {
            row.sourceLayout = editor.formSourceLayout(section, site.formNode);
          } catch (error) {
            row.layoutError = error.message;
          }
        } else row.layoutError = 'HwpxFormLayoutAbiUnavailable';
        try {
          const source = editor.formSourceAttributes(section, site.formNode);
          row.sourceAttrs = source;
          row.drawFrame = source.booleans.drawFrame;
          row.caption = text
            ? editor.formText(section, site.formNode)
            : (source.strings.caption ?? source.strings.name);
          row.foreColor = source.strings.foreColor ?? null;
          row.backColor = source.strings.backColor ?? null;
          row.backStyle = source.strings.backStyle ?? null;
          row.triState = source.booleans.triState === true;
          if (site.state === 'located') {
            row.state = text
              ? null
              : radio
                ? editor.radioButtonState(section, site.formNode)
                : editor.checkBoxState(section, site.formNode);
            row.editable =
              source.booleans.enabled === true &&
              source.booleans.editable === true &&
              (text
                ? content.hwpxFormTextEditAvailable &&
                  (site.kind === 'edit_box'
                    ? source.booleans.readOnly === false
                    : source.booleans.editEnable === true)
                : radio
                  ? editor.supportsRadioButtonSelect?.() === true &&
                    (source.strings.radioGroupName?.length > 0 ||
                      editor.supportsUnnamedRadioSelect?.() === true)
                  : true);
          } else row.error = site.state;
        } catch (error) {
          row.error = error.message;
        }
        (text ? content.formTexts : content.checkBoxes).push(row);
      }
    };
    if (typeof editor.withReadObservations === 'function')
      editor.withReadObservations(section, readSection);
    else readSection();
  }
}
