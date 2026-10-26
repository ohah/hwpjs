import { HWPX_DISPLAY_BOUNDS } from './hwpx-content.mjs';
// Current native values and positions, never text reconstructed from raw XML.
export function attachDutmal(editor, content, available) {
  content.dutmalAvailable = available;
  content.dutmalErrors = [];
  for (const paragraph of content.paragraphs) paragraph.dutmal = [];
  if (!available) return content;
  let sources;
  try {
    sources = editor.inlineStringSources();
  } catch (error) {
    content.dutmalErrors.push({ error: error.message });
    return content;
  }
  const controls = new Map(
    sources.controls
      .filter((row) => row.kind === 'dutmal')
      .map((row) => [`${row.section_ordinal}:${row.element_index}`, row]),
  );
  const paragraphs = new Map(
    content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]),
  );
  let units = content.paragraphs.reduce((sum, row) => sum + row.text.length, 0);
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      for (const site of editor.dutmalSites(section)) {
        const paragraph = paragraphs.get(`${section}:${site.paragraph - 1}`);
        if (!paragraph || paragraph.clipped) continue;
        const source = controls.get(`${section}:${site.node}`);
        const projected = editor.dutmalDisplayText(section, site.node);
        if (projected.length > HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length)
          throw new Error('DutmalDisplayBudgetExceeded');
        if (source && projected[site.anchor_unit] === '\ufffc') {
          units += projected.length - paragraph.text.length;
          paragraph.text = projected;
        }
        if (!source || projected[site.anchor_unit] !== '\ufffc') {
          content.dutmalErrors.push({ section, node: site.node, error: 'DutmalBindingMismatch' });
          continue;
        }
        try {
          paragraph.dutmal.push({
            node: site.node,
            unit: site.anchor_unit,
            mainText: editor.dutmalText(section, site.node, 'mainText'),
            subText: editor.dutmalText(section, site.node, 'subText'),
            sourceAttributes: { ...source.attributes },
          });
        } catch (error) {
          content.dutmalErrors.push({ section, node: site.node, error: error.message });
        }
      }
    } catch (error) {
      content.dutmalErrors.push({ section, error: error.message });
    }
  }
  return content;
}
