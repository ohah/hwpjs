import { hwpxRenderSourcePort } from './hwpx-render-source-port.mjs';
import { decodeCharacterFontMetrics } from '../../../../js/character-font-metrics.mjs';
import { decodeCharacterTextColors } from '../../../../js/character-text-colors.mjs';
import { decodeCharacterShades } from '../../../../js/character-shades.mjs';
import { decodeCharacterEffects } from '../../../../js/character-effects.mjs';
import { decodeCharacterOutlines } from '../../../../js/character-outlines.mjs';
import { decodeCharacterFontReferences } from '../../../../js/character-font-references.mjs';
import { decodeFontFaceMetadata } from '../../../../js/font-face-metadata.mjs';
import { decodeFontFaces } from '../../../../js/font-faces.mjs';
import { decodeCharacterStrikes } from '../../../../js/character-strikes.mjs';
import { decodeCharacterStrikeStyles } from '../../../../js/character-strike-styles.mjs';
import { decodeCharacterUnderlines } from '../../../../js/character-underlines.mjs';
import { decodeCharacterUnderlineStyles } from '../../../../js/character-underline-styles.mjs';
// Thin read-only DTO view of Native sources. No fallback geometry or owner model.
export function renderSourcePort(snapshot, expectedRevision) {
  if (
    snapshot?.protocol !== 'hwpjs.native-render-sources/3' ||
    snapshot.revision !== expectedRevision
  )
    throw Error('StaleRenderSources');
  const read = (object, key) => {
    const value = object?.[key];
    if (value === undefined) throw Error('MissingNativeRenderSource:' + key);
    if (value?.error_name) throw Error(value.error_name);
    return value;
  };
  const section = (index) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= snapshot.sectionCount)
      throw Error('InvalidSection');
    return read(snapshot, 'sections')[index];
  };
  const paragraph = (si, pi) => {
    const rows = read(section(si), 'paragraphs');
    if (!Number.isSafeInteger(pi) || pi < 0 || pi >= rows.length) throw Error('InvalidParagraph');
    return rows[pi];
  };
  const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
  const port = {
    sectionCount: () => snapshot.sectionCount,
    fileVersion: () => read(snapshot, 'fileVersion'),
    paragraphShapeCount: () => read(snapshot, 'paragraphShapes').length,
    paragraphShapeId: (si, pi) => read(paragraph(si, pi), 'paragraphShapeId'),
    characterRanges: (si, pi) =>
      read(paragraph(si, pi), 'characterRanges').map((r) => ({
        start: r.start_unit,
        end: r.end_unit,
        charShapeId: r.char_shape_id,
      })),
    paragraphShapes: () =>
      read(snapshot, 'paragraphShapes').map((r) => ({
        ...r,
        legacySpacingKind: r.legacy_spacing_kind,
        legacySpacing: r.legacy_spacing,
        modernSpacing: r.modern_spacing,
        headingKind: r.heading_kind,
        headingId: r.heading_id,
        packedHeadingLevel: r.packed_heading_level,
        extendedHeadingLevel: r.extended_heading_level,
        headingLevel: r.heading_level,
      })),
    supportsFormSources: () => true,
    supportsFormProperties: () => true,
  };
  for (const name of ['characterShapes', 'borderFillSources', 'documentProperties'])
    port[name] = () => read(snapshot, name);
  for (const name of [
    'pageSettings',
    'sectionSettings',
    'tableLayoutSources',
    'cellLayoutSources',
    'tableAnchors',
    'structuralAnchors',
    'paragraphFlow',
    'columnSources',
    'pageAreaSources',
    'masterPageSources',
    'noteSources',
    'noteShapeSources',
    'automaticNumberSources',
    'pageControlSources',
    'captionSources',
    'drawingSources',
    'drawingObjectExtras',
    'drawingComponentSources',
    'drawingAnchors',
    'drawingListSources',
    'drawingMatrixSources',
    'drawingLocalTransforms',
    'drawingRectangleCorners',
    'drawingLineEndpoints',
    'formSources',
    'formProperties',
    'formAnchors',
    'formulaSources',
    'pictureSources',
    'pictureTailSources',
    'drawingStyleSources',
  ])
    port[name] = (si) => read(section(si), name);
  port.characterFontMetrics = () =>
    decodeCharacterFontMetrics(bytes(read(snapshot, 'characterFontMetrics')), 'hwp5');
  port.characterTextColors = () =>
    decodeCharacterTextColors(bytes(read(snapshot, 'characterTextColors')));
  port.characterShades = () => decodeCharacterShades(bytes(read(snapshot, 'characterShades')));
  port.characterEffects = () => decodeCharacterEffects(bytes(read(snapshot, 'characterEffects')));
  port.characterOutlines = () =>
    decodeCharacterOutlines(bytes(read(snapshot, 'characterOutlines')));
  port.characterFontReferences = () =>
    decodeCharacterFontReferences(bytes(read(snapshot, 'characterFontReferences')));
  port.fontFaceMetadata = () => decodeFontFaceMetadata(bytes(read(snapshot, 'fontFaceMetadata')));
  port.fontFaces = () => decodeFontFaces(bytes(read(snapshot, 'fontFaces')));
  port.characterStrikes = () => decodeCharacterStrikes(bytes(read(snapshot, 'characterStrikes')));
  port.characterStrikeStyles = () =>
    decodeCharacterStrikeStyles(bytes(read(snapshot, 'characterStrikeStyles')));
  port.characterUnderlines = () =>
    decodeCharacterUnderlines(bytes(read(snapshot, 'characterUnderlines')));
  port.characterUnderlineStyles = () =>
    decodeCharacterUnderlineStyles(bytes(read(snapshot, 'characterUnderlineStyles')));
  port.pictureSources = (si, prefix = 'base73') =>
    read(section(si), prefix === 'base73' ? 'pictureSources' : 'pictureSources:' + prefix);
  port.pictureTailSources = (si, layout) =>
    read(
      section(si),
      layout === 'dimensions8' ? 'pictureTailSources' : 'pictureTailSources:' + layout,
    );
  port.drawingStyleSources = (si, options) => {
    if (
      options?.border !== 'observed13' ||
      !['fill_only', 'alpha_shadow_metadata'].includes(options.tail)
    )
      throw Error('UnsupportedDrawingStyleProfile');
    return read(
      section(si),
      options.tail === 'alpha_shadow_metadata'
        ? 'drawingStyleSources'
        : 'drawingStyleSources:fill_only',
    );
  };
  for (const name of ['drawingCurvePoints', 'drawingPolygonPoints'])
    port[name] = (si, layout) => {
      if (layout !== 'observed_i32_points') throw Error('UnsupportedNativePointProfile');
      return read(section(si), name + ':' + layout);
    };
  const camel = (value) =>
    Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]),
    );
  for (const name of ['tableBindings', 'tablePlacements'])
    port[name] = (si) => read(section(si), name).map(camel);
  return Object.freeze(port);
}

export function decodeRenderSources(bytes, expectedRevision, projection) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)
    throw Error('RenderSourceByteBounds');
  const snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    snapshot.protocol !== 'hwpjs.native-render-sources/3' ||
    !['hwp5', 'hwpx'].includes(snapshot.format)
  )
    throw Error('UnsupportedNativeRenderFormat');
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    snapshot.revision !== expectedRevision ||
    projection.nativeRevision !== expectedRevision
  )
    throw Error('StaleRenderSources');
  if (
    !Number.isSafeInteger(snapshot.sectionCount) ||
    snapshot.sectionCount < 1 ||
    snapshot.sectionCount > 4096 ||
    !Array.isArray(snapshot.sections) ||
    snapshot.sections.length !== snapshot.sectionCount
  )
    throw Error('RenderSectionBounds');
  if (projection.format !== undefined && projection.format !== snapshot.format)
    throw Error('NativeRenderFormatMismatch');
  const w = projection.window;
  if (
    !w?.enumerationComplete ||
    w.hasMore ||
    w.documentTotalRows !== projection.paragraphs.length ||
    projection.paragraphs.length > 4096
  )
    throw Error('IncompleteNativeProjection');
  let count = 0;
  for (const section of snapshot.sections) {
    if (!Array.isArray(section.paragraphs) || section.paragraphs.length > 4096)
      throw Error('RenderParagraphBounds');
    count += section.paragraphs.length;
  }
  if (count !== projection.paragraphs.length) throw Error('RenderParagraphBounds');
  const seen = new Set();
  for (const row of projection.paragraphs) {
    const key = `${row.section}:${row.paragraph}`;
    if (
      seen.has(key) ||
      !Number.isSafeInteger(row.section) ||
      row.section < 0 ||
      row.section >= snapshot.sectionCount ||
      !Number.isSafeInteger(row.paragraph) ||
      (snapshot.format === 'hwp5'
        ? row.paragraph < 0 || row.paragraph >= snapshot.sections[row.section].paragraphs.length
        : !snapshot.sections[row.section].paragraphs.some(
            (p) => p.nativeParagraph === row.paragraph && p.sourceNode === row.sourceNode,
          ))
    )
      throw Error('RenderOwnerBounds');
    seen.add(key);
  }
  return {
    snapshot,
    port:
      snapshot.format === 'hwpx'
        ? hwpxRenderSourcePort(snapshot)
        : renderSourcePort(snapshot, expectedRevision),
  };
}
