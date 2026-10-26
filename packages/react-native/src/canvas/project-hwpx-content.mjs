import { attachHwpxStyles } from '../../../../web/preview/hwpx-style-content.mjs';
import { attachHwpxTables } from '../../../../web/preview/hwpx-table-content.mjs';
import { attachHwpxTableBorders } from '../../../../web/preview/hwpx-table-border-content.mjs';
import { attachHwpxParagraphFormats } from '../../../../web/preview/hwpx-paragraph-formats.mjs';
import { attachHwpxPictures } from '../../../../web/preview/hwpx-picture-content.mjs';
import { attachHwpxLines } from '../../../../web/preview/hwpx-line-content.mjs';
import { attachHwpxConnectors } from '../../../../web/preview/hwpx-connector-content.mjs';
import { attachDrawingTextBindings } from '../../../../web/preview/drawing-text-content.mjs';
import { attachHwpxPageSettings } from '../../../../web/preview/hwpx-page-content.mjs';
import { attachHwpxPictureCaptions } from '../../../../web/preview/hwpx-picture-captions.mjs';
import { attachHwpxPageAreaDeclarations } from '../../../../web/preview/hwpx-page-area-declarations.mjs';
import { attachEllipses } from '../../../../web/preview/ellipse-content.mjs';
import { attachTabDefinitions } from '../../../../web/preview/tab-definition-content.mjs';
import { attachSectionTabSources } from '../../../../web/preview/section-tab-content.mjs';

export function projectNativeHwpx(projection, snapshot, port) {
  const paragraphs = projection.paragraphs.map((row) => {
    // Native source metadata binds the global 1-based owner. Only the derived
    // canonical web layout address becomes 0-based; no raw/display unit remapping.
    const source = snapshot.sections[row.section].paragraphs.find(
      (p) => p.nativeParagraph === row.paragraph,
    );
    if (!source || source.sourceNode !== row.sourceNode) throw Error('NativeRenderOwnerMismatch');
    const text = port.anchorText(row.section, row.paragraph);
    if (row.rawPlain && row.text !== text) throw Error('NativeRenderTextMismatch');
    return {
      ...row,
      paragraph: row.paragraph - 1,
      publicParagraph: row.paragraph,
      text,
      clipped: false,
    };
  });
  const { window, ...base } = projection;
  const content = {
    ...base,
    paragraphs,
    nativeEnumeration: window,
    limited: false,
    readOnly: false,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
  };
  attachHwpxStyles(port, content, true);
  if (content.characterShapesError || paragraphs.some((p) => p.characterRangesError))
    throw Error('IncompleteNativeCharacterSources');
  attachHwpxTables(port, content);
  attachHwpxTableBorders(port, content, true);
  attachHwpxParagraphFormats(port, content, true);
  attachDrawingTextBindings(port, content);
  attachHwpxPictures(port, content);
  attachHwpxLines(port, content);
  attachHwpxConnectors(port, content);
  attachTabDefinitions(port, content);
  attachSectionTabSources(port, content);
  attachEllipses(port, content, true);
  attachHwpxPageSettings(port, content);
  attachHwpxPictureCaptions(port, content, true);
  attachHwpxPageAreaDeclarations(port, content, true);
  content.lines.push(
    ...content.connectors.flatMap((row) => (row.referenceLine ? [row.referenceLine] : [])),
  );
  // Source errors must not silently turn a document into plain body rows.
  for (const key of ['pageSettingsError', 'paragraphShapesError'])
    if (content[key]) throw Error(content[key]);
  for (const key of [
    'paragraphFlowErrors',
    'tableBindingsErrors',
    'tablePlacementsErrors',
    'tableGeometryErrors',
    'tableCellMarginErrors',
    'tableCaptionErrors',
    'tableBorderSourceErrors',
    'drawingTextBindingErrors',
    'drawingTextSnapshotErrors',
    'pictureErrors',
    'lineErrors',
    'connectorErrors',
    'rectangleSourceErrors',
    'fillBrushErrors',
  ])
    if (content[key]?.length)
      throw Error('IncompleteNativeHwpxSource:' + key + ':' + (content[key][0].error ?? 'Unknown'));
  return content;
}
