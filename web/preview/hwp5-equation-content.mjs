import { sourceDisplayPositions } from './text-offsets.mjs';
import { colorrefCss } from './colorref-css.mjs';
import { attachEquationRendering } from './equation-render-content.mjs';

/** Read-only HWP5 source adapter for the shared equation parser and painter.
 * Native physical links own the anchors; display offsets grant no edit rights.
 * A single snapshot per section avoids reparsing a Section for every equation.
 */
export function attachHwp5EquationRendering(editor, content, getContext) {
  const available = editor?.supportsEquationSources?.() === true;
  content.equationAvailable = available;
  content.equationErrors = [];
  const sections = new Map(),
    ambiguous = new Set();
  for (const paragraph of content.paragraphs) {
    paragraph.equations = [];
    let rows = sections.get(paragraph.section);
    if (!rows) sections.set(paragraph.section, (rows = new Map()));
    if (rows.has(paragraph.paragraph)) ambiguous.add(paragraph.section);
    rows.set(paragraph.paragraph, paragraph);
  }
  const snapshots = new Map();
  if (available)
    for (const [section, paragraphs] of sections) {
      try {
        if (ambiguous.has(section)) throw Error('AmbiguousHwp5EquationParagraph');
        const sources = editor.equationSnapshot(section, 'version-only');
        const grouped = new Map(),
          seen = new Set(),
          staged = [];
        for (const source of sources) {
          const site = source.site;
          if (seen.has(site.equationNode)) throw Error('AmbiguousHwp5EquationAnchor');
          seen.add(site.equationNode);
          const paragraph = paragraphs.get(site.paragraph);
          if (!paragraph || paragraph.clipped) continue;
          let rows = grouped.get(paragraph);
          if (!rows) grouped.set(paragraph, (rows = []));
          rows.push(source);
        }
        for (const [paragraph, sources] of grouped) {
          const boundaries = sources.flatMap((source) => [
            source.site.currentUnit,
            source.site.currentUnit + 8,
          ]);
          const positions = sourceDisplayPositions(
            boundaries,
            paragraph.sourceOffsets,
            paragraph.text.length,
          );
          for (let index = 0; index < sources.length; index++) {
            const unit = positions[index * 2];
            if (paragraph.text[unit] !== '\ufffc' || positions[index * 2 + 1] !== unit + 1)
              throw Error('Hwp5EquationBindingMismatch');
            staged.push({ paragraph, node: sources[index].site.equationNode, unit });
          }
        }
        for (const { paragraph, node, unit } of staged) paragraph.equations.push({ node, unit });
        snapshots.set(section, sources);
      } catch (error) {
        content.equationErrors.push({ section, error: error.message });
      }
    }
  const adapter = {
    equationScripts(section) {
      return {
        rows: snapshots.get(section).map((source) => ({
          source: {
            node: source.site.equationNode,
            issue: source.decoding.script === 'exact' ? null : 'InvalidEquationUtf16',
          },
          value: source.script,
        })),
      };
    },
    equationStyles(section) {
      return snapshots.get(section).map((source) => ({
        node: source.site.equationNode,
        base_unit: String(source.fontSize),
        text_color: colorrefCss(source.color),
        // The opaque trailing font record is not inferred from its byte count.
        font: null,
      }));
    },
    measureEquation: (...args) => editor.measureEquation(...args),
    layoutEquation: (...args) => editor.layoutEquation(...args),
  };
  return attachEquationRendering(adapter, content, available, getContext, true);
}
