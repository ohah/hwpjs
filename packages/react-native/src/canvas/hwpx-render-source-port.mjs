import { decodeCaptionBindings } from '../../../../js/caption-bindings-wire.mjs';
import { decodeCharacterEffects } from '../../../../js/character-effects.mjs';
import { decodeCharacterFontMetrics } from '../../../../js/character-font-metrics.mjs';
import { decodeCharacterFontReferences } from '../../../../js/character-font-references.mjs';
import { decodeCharacterOutlines } from '../../../../js/character-outlines.mjs';
import { decodeCharacterRanges } from '../../../../js/hwpx-character-shapes-wire.mjs';
import { decodeCharacterShades } from '../../../../js/character-shades.mjs';
import { decodeCharacterShapes } from '../../../../js/hwpx-character-shapes-wire.mjs';
import { decodeCharacterStrikeStyles } from '../../../../js/character-strike-styles.mjs';
import { decodeCharacterStrikes } from '../../../../js/character-strikes.mjs';
import { decodeCharacterTextColors } from '../../../../js/character-text-colors.mjs';
import { decodeCharacterUnderlineStyles } from '../../../../js/character-underline-styles.mjs';
import { decodeCharacterUnderlines } from '../../../../js/character-underlines.mjs';
import { decodeConnectorNodes } from '../../../../js/hwpx-connector-source.mjs';
import { decodeConnectorOwner } from '../../../../js/hwpx-connector-source.mjs';
import { decodeConnectorRenderingSource } from '../../../../js/hwpx-connector-source.mjs';
import { decodeConnectorSource } from '../../../../js/hwpx-connector-source.mjs';
import { decodeContainerSource } from '../../../../js/hwpx-container-source.mjs';
import { decodeDrawingStrokeSource } from '../../../../js/hwpx-drawing-stroke-source.mjs';
import { decodeDrawingTextBindings } from '../../../../js/hwpx-drawing-text-bindings.mjs';
import { decodeDrawingTextSnapshots } from '../../../../js/hwpx-drawing-text-snapshots.mjs';
import { decodeEllipseSources } from '../../../../js/hwpx-ellipse-sources.mjs';
import { decodeFillBrushes } from '../../../../js/hwpx-fill-brushes.mjs';
import { decodeFontFaces } from '../../../../js/font-faces.mjs';
import { decodeFormulaFieldSources } from '../../../../js/hwpx-formula-field-sources.mjs';
import { decodeHwpxFontFaceMetadata } from '../../../../js/hwpx-font-face-metadata.mjs';
import { decodeHwpxParagraphShapes } from '../../../../js/hwpx-paragraph-shapes.mjs';
import { decodeLineDisplay } from '../../../../js/hwpx-line-display-wire.mjs';
import { decodeLineGeometry } from '../../../../js/hwpx-line-geometry.mjs';
import { decodeLineNodes } from '../../../../js/hwpx-line-display-wire.mjs';
import { decodeLinePlacement } from '../../../../js/hwpx-line-display-wire.mjs';
import { decodeNoteReferenceSites } from '../../../../js/hwpx-note-reference-sites.mjs';
import { decodeNoteShapes } from '../../../../js/hwpx-note-shapes.mjs';
import { decodePageAreaDeclarations } from '../../../../js/hwpx-page-area-declarations.mjs';
import { decodePageSettings } from '../../../../js/hwpx-page-settings.mjs';
import { decodeParagraphFlow } from '../../../../js/hwpx-page-settings.mjs';
import { decodeParagraphTextSnapshot } from '../../../../js/hwpx-paragraph-text-snapshot.mjs';
import { decodePictureCrop } from '../../../../js/hwpx-picture-crop-wire.mjs';
import { decodePictureFlow } from '../../../../js/hwpx-picture-flow-wire.mjs';
import { decodePictureGeometry } from '../../../../js/hwpx-picture-geometry-wire.mjs';
import { decodePictureOwners } from '../../../../js/hwpx-picture-owners.mjs';
import { decodePictureOwner } from '../../../../js/hwpx-picture-owner-wire.mjs';
import { decodePicturePosition } from '../../../../js/hwpx-picture-position-wire.mjs';
import { decodePictureRenderingCorners } from '../../../../js/hwpx-picture-corners-wire.mjs';
import { decodePictureSites } from '../../../../js/hwpx-picture-sites-wire.mjs';
import { decodePictureTransform } from '../../../../js/hwpx-picture-transform-wire.mjs';
import { decodeRectangleRenderingSources } from '../../../../js/hwpx-rectangle-rendering-sources.mjs';
import { decodeRectangleRenderingSource } from '../../../../js/hwpx-rectangle-rendering-source.mjs';
import { decodeSectionTabs } from '../../../../js/hwpx-section-tabs.mjs';
import { decodeTabDefinitions } from '../../../../js/hwpx-tab-definitions.mjs';
import { decodeTableBindings } from '../../../../js/table-bindings-wire.mjs';
import { decodeTableBorderSources } from '../../../../js/hwpx-table-border-sources.mjs';
import { decodeTableCaptionBindings } from '../../../../js/hwpx-table-caption-bindings.mjs';
import { decodeTableCaption } from '../../../../js/hwpx-table-caption.mjs';
import { decodeTableCellMargin } from '../../../../js/hwpx-table-cell-margin.mjs';
import { decodeTableGeometry } from '../../../../js/hwpx-table-geometry.mjs';
import { decodeTablePagination } from '../../../../js/hwpx-table-pagination.mjs';
import { decodeTablePlacements } from '../../../../js/table-placements-wire.mjs';
import { decodeTabSources } from '../../../../js/hwpx-tab-sources.mjs';
// Owned readonly Native query wires, decoded by exactly the existing JS decoders.
export function hwpxRenderSourcePort(snapshot) {
  const bank = new Map();
  let total = 0;
  if (!Array.isArray(snapshot.queries) || snapshot.queries.length > 32768)
    throw Error('RenderQueryBudget');
  for (const query of snapshot.queries) {
    if (
      typeof query.name !== 'string' ||
      !/^[a-z_]{1,64}$/.test(query.name) ||
      !Array.isArray(query.args) ||
      query.args.length > 3 ||
      !query.args.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)
    )
      throw Error('InvalidRenderQuery');
    const key = JSON.stringify([query.name, query.args]);
    if (bank.has(key)) throw Error('DuplicateRenderQuery');
    if (query.error_name !== null) {
      if (
        typeof query.error_name !== 'string' ||
        !query.error_name ||
        query.error_name.length > 160 ||
        query.wire !== null
      )
        throw Error('InvalidRenderQueryError');
      bank.set(key, { error: query.error_name });
      continue;
    }
    if (!Array.isArray(query.wire) || query.wire.length > 32 * 1024 * 1024 - total)
      throw Error('RenderWireBudget');
    if (!query.wire.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
      throw Error('InvalidRenderWireByte');
    total += query.wire.length;
    bank.set(key, { bytes: Uint8Array.from(query.wire) });
  }
  const wire = (name, args) => {
    const row = bank.get(JSON.stringify([name, args]));
    if (!row) throw Error('MissingNativeRenderQuery:' + name);
    if (row.error) throw Error(row.error);
    return row.bytes;
  };
  const integers = (name, args) => {
    const bytes = wire(name, args);
    if (bytes.length % 4) throw Error('InvalidParagraphShapeIds');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true));
  };
  const port = {
    sectionCount: () => snapshot.sectionCount,
    paragraphShapeIds() {
      return integers('paragraph_shape_ids', []);
    },
    paragraphShapeRefs(section) {
      const values = integers('paragraph_shape_refs', [section]);
      if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2)
        throw Error('InvalidParagraphShapeIds');
      return { firstParagraph: values[0], ids: values.slice(2) };
    },
    anchorText(section, paragraph) {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        wire('anchor_text', [section, paragraph]),
      );
    },
    rectangleNodes(section) {
      const rows = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(wire('rectangle_nodes', [section])),
      );
      if (
        !Array.isArray(rows) ||
        rows.length > 100000 ||
        !rows.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)
      )
        throw Error('InvalidRectangleNodes');
      return rows;
    },
    tabSources(section, paragraph) {
      const value = decodeTabSources(wire('tab_sources', [section, paragraph]));
      if (value.section !== section || value.paragraph !== paragraph)
        throw Error('TabSourcesParagraphMismatch');
      return value;
    },
    pictureSizeProtection(section, node) {
      const value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          wire('picture_size_protection', [section, node]),
        ),
      );
      if (value !== null && typeof value !== 'boolean') throw Error('InvalidPictureSizeProtection');
      return value;
    },
    paragraphShapes() {
      return decodeHwpxParagraphShapes(wire('paragraph_shapes', []));
    },
    pageSettings() {
      return decodePageSettings(wire('page_settings', []));
    },
    noteShapes() {
      return decodeNoteShapes(wire('note_shapes', []));
    },
    tabDefinitions() {
      return decodeTabDefinitions(wire('tab_definitions', []));
    },
    sectionTabSources() {
      return decodeSectionTabs(wire('section_tabs', []));
    },
    characterShapes() {
      return decodeCharacterShapes(wire('character_shapes', []));
    },
    fontFaces() {
      return decodeFontFaces(wire('font_faces', []));
    },
    fontFaceMetadata() {
      return decodeHwpxFontFaceMetadata(wire('font_face_metadata', []));
    },
    characterFontMetrics() {
      return decodeCharacterFontMetrics(wire('character_font_metrics', []), 'hwpx');
    },
    characterTextColors() {
      return decodeCharacterTextColors(wire('character_text_colors', []));
    },
    characterShades() {
      return decodeCharacterShades(wire('character_shades', []));
    },
    characterEffects() {
      return decodeCharacterEffects(wire('character_effects', []));
    },
    characterOutlines() {
      return decodeCharacterOutlines(wire('character_outlines', []));
    },
    characterFontReferences() {
      return decodeCharacterFontReferences(wire('character_font_references', []));
    },
    characterStrikeStyles() {
      return decodeCharacterStrikeStyles(wire('character_strike_styles', []));
    },
    characterStrikes() {
      return decodeCharacterStrikes(wire('character_strikes', []));
    },
    characterUnderlines() {
      return decodeCharacterUnderlines(wire('character_underlines', []));
    },
    characterUnderlineStyles() {
      return decodeCharacterUnderlineStyles(wire('character_underline_styles', []));
    },
    sectionFillBrushes(section) {
      return decodeFillBrushes(wire('section_fill_brushes', [section]));
    },
    paragraphTextSnapshot(section) {
      return decodeParagraphTextSnapshot(wire('paragraph_text_snapshot', [section]));
    },
    paragraphFlow(section) {
      return decodeParagraphFlow(wire('paragraph_flow', [section]));
    },
    tableBindings(section) {
      return decodeTableBindings(wire('table_bindings', [section]));
    },
    tablePlacements(section) {
      return decodeTablePlacements(wire('table_placements', [section]));
    },
    tablePagination(section) {
      return decodeTablePagination(wire('table_pagination', [section]));
    },
    tableBorderSources(section) {
      return decodeTableBorderSources(wire('table_border_sources', [section]));
    },
    tableCaptionBindings(section) {
      return decodeTableCaptionBindings(wire('table_caption_bindings', [section]));
    },
    pictureSites(section) {
      return decodePictureSites(wire('picture_sites', [section]));
    },
    pictureOwners(section) {
      return decodePictureOwners(wire('picture_owners', [section]));
    },
    pictureCaptionBindings(section) {
      return decodeCaptionBindings(
        wire('picture_caption_bindings', [section]),
        'picture_node',
        'InvalidPictureCaptionBindings',
      );
    },
    containerCaptionBindings(section) {
      return decodeCaptionBindings(
        wire('container_caption_bindings', [section]),
        'container_node',
        'InvalidContainerCaptionBindings',
      );
    },
    drawingTextBindings(section) {
      return decodeDrawingTextBindings(wire('drawing_text_bindings', [section]));
    },
    drawingTextSnapshots(section) {
      return decodeDrawingTextSnapshots(wire('drawing_text_snapshots', [section]));
    },
    rectangleRenderingSources(section) {
      return decodeRectangleRenderingSources(wire('rectangle_rendering_sources', [section]));
    },
    ellipseSources(section) {
      return decodeEllipseSources(wire('ellipse_sources', [section]));
    },
    lineNodes(section) {
      return decodeLineNodes(wire('line_nodes', [section]));
    },
    connectorNodes(section) {
      return decodeConnectorNodes(wire('connector_nodes', [section]));
    },
    pageAreaDeclarations(section) {
      return decodePageAreaDeclarations(wire('page_area_declarations', [section]));
    },
    noteReferenceSites(section) {
      return decodeNoteReferenceSites(wire('note_reference_sites', [section]));
    },
    formulaFieldSources(section) {
      return decodeFormulaFieldSources(wire('formula_field_sources', [section]));
    },
    characterRanges(section, paragraph) {
      return decodeCharacterRanges(wire('character_ranges', [section, paragraph]));
    },
    tableCellMargin(section, listNode) {
      return decodeTableCellMargin(wire('table_cell_margin', [section, listNode]));
    },
    tableGeometry(section, tableNode) {
      return decodeTableGeometry(wire('table_geometry', [section, tableNode]));
    },
    tableCaption(section, tableNode) {
      return decodeTableCaption(wire('table_caption', [section, tableNode]));
    },
    pictureOwner(section, pictureNode) {
      return decodePictureOwner(wire('picture_owner', [section, pictureNode]));
    },
    picturePosition(section, pictureNode) {
      return decodePicturePosition(wire('picture_position', [section, pictureNode]));
    },
    pictureFlow(section, pictureNode) {
      return decodePictureFlow(wire('picture_flow', [section, pictureNode]));
    },
    pictureGeometry(section, pictureNode) {
      return decodePictureGeometry(wire('picture_geometry', [section, pictureNode]));
    },
    pictureCrop(section, pictureNode) {
      return decodePictureCrop(wire('picture_crop', [section, pictureNode]));
    },
    pictureTransform(section, pictureNode) {
      return decodePictureTransform(wire('picture_transform', [section, pictureNode]));
    },
    pictureRenderingCorners(section, pictureNode) {
      return decodePictureRenderingCorners(
        wire('picture_rendering_corners', [section, pictureNode]),
      );
    },
    pictureCaption(section, pictureNode) {
      return decodeTableCaption(wire('picture_caption', [section, pictureNode]));
    },
    lineDisplay(section, lineNode) {
      return decodeLineDisplay(wire('line_display', [section, lineNode]));
    },
    linePlacement(section, lineNode) {
      return decodeLinePlacement(wire('line_placement', [section, lineNode]));
    },
    lineGeometry(section, node) {
      return decodeLineGeometry(wire('line_geometry', [section, node]), node);
    },
    connectorGeometrySource(section, node) {
      return decodeConnectorSource(wire('connector_geometry_source', [section, node]));
    },
    connectorOwner(section, node) {
      return decodeConnectorOwner(wire('connector_owner', [section, node]), node);
    },
    connectorRenderingSource(section, node) {
      return decodeConnectorRenderingSource(
        wire('connector_rendering_source', [section, node]),
        node,
      );
    },
    drawingStrokeSource(section, node) {
      return decodeDrawingStrokeSource(wire('drawing_stroke_source', [section, node]), node);
    },
    containerSourceSnapshot(section, containerNode) {
      return decodeContainerSource(wire('container_source_snapshot', [section, containerNode]));
    },
    rectangleRenderingSource(section, rectangleNode) {
      return decodeRectangleRenderingSource(
        wire('rectangle_rendering_source', [section, rectangleNode]),
      );
    },
  };
  return Object.freeze(port);
}
