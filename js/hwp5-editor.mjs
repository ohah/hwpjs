import { decodeCharacterFontMetrics } from "./character-font-metrics.mjs";
import { validateAbi } from "./abi.mjs";
import { decodeHwp5FieldSpans } from "./hwp5-field-spans.mjs";
import { decodeHwp5FieldTopology } from "./hwp5-field-topology.mjs";
import { decodeHwp5TextSourceProtection } from "./hwp5-text-source-protection.mjs";
import { decodeCharacterEffects } from "./character-effects.mjs";
import { characterEffectArgs, characterEffectMode } from "./character-effect-args.mjs";
import { hwp5CharacterOutlineArg } from "./character-outline-args.mjs";
import { decodeCharacterOutlines } from "./character-outlines.mjs";
import { decodeHwp5StructuralAnchors } from "./hwp5-structural-anchors.mjs";
import { decodeHwp5PageAreaSources } from "./hwp5-page-area-sources.mjs";
import { decodeHwp5MasterPageSources } from "./hwp5-master-page-sources.mjs";
import { decodeHwp5DocumentProperties } from "./hwp5-document-properties.mjs";
import { decodeHwp5AutomaticNumberSources } from "./hwp5-automatic-number-sources.mjs";
import { decodeHwp5PageControlSources } from "./hwp5-page-control-sources.mjs";
import { decodeHwp5NoteSources } from "./hwp5-note-sources.mjs";
import { decodeHwp5NoteShapeSources } from "./hwp5-note-shape-sources.mjs";
import { decodeHwp5CaptionSources } from "./hwp5-caption-sources.mjs";
import { decodeHwp5DrawingSources } from "./hwp5-drawing-sources.mjs";
import { decodeHwp5DrawingObjectExtras } from "./hwp5-drawing-object-extras.mjs";
import { decodeHwp5DrawingComponentSources } from "./hwp5-drawing-component-sources.mjs";
import { decodeHwp5DrawingAnchors } from "./hwp5-drawing-anchors.mjs";
import { decodeHwp5DrawingListSources } from "./hwp5-drawing-list-sources.mjs";
import { decodeHwp5DrawingMatrixSources } from "./hwp5-drawing-matrix-sources.mjs";
import { decodeHwp5DrawingLocalTransforms } from "./hwp5-drawing-local-transforms.mjs";
import { decodeHwp5DrawingRectangleCorners } from "./hwp5-drawing-rectangle-corners.mjs";
import { decodeHwp5DrawingLineEndpoints } from "./hwp5-drawing-line-endpoints.mjs";
import { decodeHwp5DrawingStyleSources, drawingStyleLayoutArgs } from "./hwp5-drawing-style-sources.mjs";
import { decodeHwp5PictureSources, picturePrefixArg } from "./hwp5-picture-sources.mjs";
import { decodeHwp5PictureTailSources, pictureTailLayoutArg } from "./hwp5-picture-tail-sources.mjs";
import { paragraphMarginArgs } from "./paragraph-margin-args.mjs";
import { paragraphSpacingArgs } from "./paragraph-spacing-args.mjs";
import { characterPropertyArgs } from "./character-property-args.mjs";
import { encodeCharacterRanges } from "./character-range-batch.mjs";
import { encodeParagraphReplacement } from "./paragraph-replacement.mjs";
import { characterUnderlineArg } from "./character-underline-args.mjs";
import { characterColorArg } from "./character-color-args.mjs";
import { characterShadeArgs } from "./character-shade-args.mjs";
import { decodeCharacterShades } from "./character-shades.mjs";
import { characterFontArgs } from "./character-font-args.mjs";
import { characterFontNameArgs } from "./character-font-name-args.mjs";
import { namedFontTextArgs } from "./named-font-text-args.mjs";
import { textTransactionArgs } from "./text-transaction-args.mjs";
import { decodeCharacterUnderlines } from "./character-underlines.mjs";
import { decodeCharacterStrikes } from "./character-strikes.mjs";
import { decodeCharacterStrikeStyles } from "./character-strike-styles.mjs";
import { decodeCharacterTextColors } from "./character-text-colors.mjs";
import { decodeCharacterFontReferences } from "./character-font-references.mjs";
import { decodeFontFaces } from "./font-faces.mjs";
import { decodeFontFaceMetadata } from "./font-face-metadata.mjs";
import { decodeCharacterUnderlineStyles } from "./character-underline-styles.mjs";
import { createMemory } from "./wasm-memory.mjs";
import { inputBytes } from "./input.mjs";
import { EXPERIMENTAL_EDITOR_FUNCTIONS } from "./abi-schema.mjs";
import { createHistoryApi } from "./editor-history.mjs";
import { createParagraphBreakApi } from "./paragraph-break-api.mjs";
import { decodeCharacterShapes, decodeCharacterRanges } from "./character-shapes-wire.mjs";
import { decodeTableBindings } from "./table-bindings-wire.mjs";
import { decodeTablePlacements } from "./table-placements-wire.mjs";
import { decodeParagraphShapes } from "./paragraph-shapes-wire.mjs";
import { decodeHwp5PageSettings } from "./hwp5-page-settings.mjs";
import { decodeHwp5SectionSettings } from "./hwp5-section-settings.mjs";
import { decodeHwp5TableLayoutSources } from "./hwp5-table-layout-sources.mjs";
import { decodeHwp5CellLayoutSources } from "./hwp5-cell-layout-sources.mjs";
import { decodeHwp5TableAnchors } from "./hwp5-table-anchors.mjs";
import { decodeHwp5ParagraphFlow, decodeHwp5ColumnSources } from "./hwp5-flow-sources.mjs";
import { decodeHwp5FormulaSources } from "./hwp5-formula-sources.mjs";
import { decodeHwp5NormalizationInfo } from "./hwp5-normalization-info.mjs";
import { validateObservedDocInfoOption, decodeObservedDocInfoDiagnostics } from "./hwp5-observed-docinfo.mjs";
import { validateAvailableSectionCopyOption, decodeAvailableSectionCopyInfo } from "./hwp5-available-section-copy.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
const u32 = (value, name) => { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`Invalid ${name}`); return value; };

/** Experimental HWP5 editing; no page layout engine. */
export async function createExperimentalHwp5Editor(source, input, { distribution = false, normalizeObservedCfb = false, availableSectionCopy = false, retainObservedDocInfo = false } = {}) {
  validateObservedDocInfoOption(retainObservedDocInfo, distribution, availableSectionCopy);
  if (typeof distribution !== "boolean") throw new TypeError("Invalid distribution option");
  if (typeof normalizeObservedCfb !== "boolean") throw new TypeError("Invalid normalization option");
  validateAvailableSectionCopyOption(availableSectionCopy, distribution, normalizeObservedCfb);
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of EXPERIMENTAL_EDITOR_FUNCTIONS) if (typeof wasm[name] !== "function") throw new Error(`Missing experimental editor export: ${name}`);
  const memory = createMemory(wasm);
  let closed = false;
  const check = () => { if (closed) throw new Error("EditorClosed"); };
  const success = value => { if (!value) throw memory.error(); };
  const count = value => { if ((value >>> 0) === 0xffffffff) throw memory.error(); return value >>> 0; };
  const output = action => {
    try { success(action()); return { bytes: memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len()), layoutRequiresReflow: Boolean(wasm.hwp5_edit_reflow()) }; }
    finally { wasm.hwp5_edit_output_free(); }
  };
  const bytes = inputBytes(input);
  if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
  const open = retainObservedDocInfo ? wasm.hwp5_edit_open_observed_docinfo : availableSectionCopy ? wasm.hwp5_edit_open_available_section_copy : normalizeObservedCfb
    ? distribution ? wasm.hwp5_edit_open_normalized_distribution : wasm.hwp5_edit_open_normalized
    : distribution ? wasm.hwp5_edit_open_distribution : wasm.hwp5_edit_open;
  if (normalizeObservedCfb && distribution && typeof open !== "function") throw new Error("Hwp5NormalizedDistributionAbiUnavailable");
  if (retainObservedDocInfo && (typeof open !== "function" || typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function")) throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
  if (normalizeObservedCfb && typeof open !== "function") throw new Error("Hwp5NormalizationAbiUnavailable");
  if (availableSectionCopy && (typeof open !== "function" || typeof wasm.hwp5_edit_available_section_copy_info !== "function")) throw new Error("Hwp5AvailableSectionCopyAbiUnavailable");
  if (typeof open !== "function") throw new Error("Hwp5DistributionEditorAbiUnavailable");
  memory.withBytes(bytes, (ptr, size) => success(retainObservedDocInfo ? open(ptr, size, normalizeObservedCfb ? 1 : 0) : open(ptr, size)));
  const copyText = (section, paragraph) => { check(); return output(() => wasm.hwp5_edit_copy_text(u32(section, "section"), u32(paragraph, "paragraph"))).bytes; };
  return {
    observedDocInfoDiagnostics() {
      check();
      if (typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function") throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
      return decodeObservedDocInfoDiagnostics(output(() => wasm.hwp5_edit_observed_docinfo_diagnostics()).bytes);
    },
    ...createParagraphBreakApi({ wasm, memory, check, uint: u32, prefix: "hwp5_edit", endAsCount: false, unavailable: "Hwp5ParagraphBreakAbiUnavailable" }),
    supportsNormalizationInfo() { check(); return typeof wasm[availableSectionCopy ? "hwp5_edit_available_section_copy_info" : "hwp5_edit_normalization_info"] === "function"; },
    normalizationInfo() {
      check();
      if (availableSectionCopy) {
        const info = decodeAvailableSectionCopyInfo(output(() => wasm.hwp5_edit_available_section_copy_info()).bytes);
        if (!info) throw new Error("InvalidAvailableSectionCopyInfo");
        return info;
      }
      if (typeof wasm.hwp5_edit_normalization_info !== "function") throw new Error("Hwp5NormalizationAbiUnavailable");
      return decodeHwp5NormalizationInfo(output(() => wasm.hwp5_edit_normalization_info()).bytes);
    },
    supportsTextSourcePolicy() { check(); return typeof wasm.hwp5_edit_validate_text_source_policy === "function"; },
    supportsTextSourceProtection() { check(); return typeof wasm.hwp5_edit_text_source_protection === "function"; },
    textSourceProtection(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_text_source_protection !== "function") throw new Error("Hwp5TextSourceProtectionAbiUnavailable");
      const bytes = output(() => wasm.hwp5_edit_text_source_protection(index)).bytes;
      return decodeHwp5TextSourceProtection(bytes, wasm.hwp5_edit_paragraph_count(index));
    },
    validateTextSourcePolicy(section) {
      check(); u32(section, "section");
      if (typeof wasm.hwp5_edit_validate_text_source_policy !== "function") throw new Error("Hwp5TextSourcePolicyAbiUnavailable");
      success(wasm.hwp5_edit_validate_text_source_policy(section));
    },
    ...createHistoryApi({ wasm, memory, check, uint: u32, prefix: "hwp5_edit", unavailable: "Hwp5HistoryAbiUnavailable" }),
    sectionCount() { check(); return count(wasm.hwp5_edit_section_count()); },
    paragraphCount(section) { check(); return count(wasm.hwp5_edit_paragraph_count(u32(section, "section"))); },
    characterShapeCount() { check(); return count(wasm.hwp5_edit_char_shape_count()); },
    paragraphShapeCount() {
      check();
      if (typeof wasm.hwp5_edit_para_shape_count !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      return count(wasm.hwp5_edit_para_shape_count());
    },
    paragraphShapeId(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_para_shape_id !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      return count(wasm.hwp5_edit_para_shape_id(u32(section, "section"), u32(paragraph, "paragraph")));
    },
    setParagraphFormat({ section, paragraph, paraShapeId }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), u32(paraShapeId, "paraShapeId")];
      if (typeof wasm.hwp5_edit_set_paragraph_format !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_format(...values));
    },
    setParagraphAlignment({ section, paragraph, alignment }) {
      check();
      const value = ["JUSTIFY", "LEFT", "RIGHT", "CENTER", "DISTRIBUTE", "DISTRIBUTE_SPACE"].indexOf(alignment);
      if (value < 0) throw new RangeError("InvalidParagraphAlignment");
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), value];
      if (typeof wasm.hwp5_edit_set_paragraph_alignment !== "function") throw new Error("Hwp5ParagraphAlignmentAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_alignment(...values));
    },
    setParagraphMargins({ section, paragraph, margins }) {
      check();
      const args = [u32(section, "section"), u32(paragraph, "paragraph")];
      const [mask, ...values] = paragraphMarginArgs(margins);
      if (typeof wasm.hwp5_edit_set_paragraph_margins !== "function") throw new Error("Hwp5ParagraphMarginsAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_margins(...args, mask, ...values));
    },
    setParagraphSpacing({ section, paragraph, type, value }) {
      check();
      const args = [u32(section, "section"), u32(paragraph, "paragraph"), ...paragraphSpacingArgs(type, value)];
      if (typeof wasm.hwp5_edit_set_paragraph_spacing !== "function") throw new Error("Hwp5ParagraphSpacingAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_spacing(...args));
    },
    paragraphShapes() {
      check();
      if (typeof wasm.hwp5_edit_paragraph_shapes !== "function") throw new Error("Hwp5ParagraphShapesAbiUnavailable");
      return decodeParagraphShapes(output(() => wasm.hwp5_edit_paragraph_shapes()).bytes);
    },
    characterShapes() {
      check();
      if (typeof wasm.hwp5_edit_character_shapes !== "function") throw new Error("Hwp5CharacterShapesAbiUnavailable");
      return decodeCharacterShapes(output(() => wasm.hwp5_edit_character_shapes()).bytes);
    },
    fontFaces() {
      check();
      if (typeof wasm.hwp5_edit_font_faces !== "function") throw new Error("Hwp5FontFacesAbiUnavailable");
      return decodeFontFaces(output(() => wasm.hwp5_edit_font_faces()).bytes);
    },
    fontFaceMetadata() {
      check();
      if (typeof wasm.hwp5_edit_font_face_metadata !== "function") throw new Error("Hwp5FontFaceMetadataAbiUnavailable");
      return decodeFontFaceMetadata(output(() => wasm.hwp5_edit_font_face_metadata()).bytes);
    },
    characterFontReferences() {
      check();
      if (typeof wasm.hwp5_edit_character_font_references !== "function") throw new Error("Hwp5CharacterFontReferencesAbiUnavailable");
      return decodeCharacterFontReferences(output(() => wasm.hwp5_edit_character_font_references()).bytes);
    },
    characterFontMetrics() {
      check();
      if (typeof wasm.hwp5_edit_character_font_metrics !== "function") throw new Error("Hwp5CharacterFontMetricsAbiUnavailable");
      return decodeCharacterFontMetrics(output(() => wasm.hwp5_edit_character_font_metrics()).bytes, "hwp5");
    },
    characterTextColors() {
      check();
      if (typeof wasm.hwp5_edit_character_text_colors !== "function") throw new Error("Hwp5CharacterTextColorsAbiUnavailable");
      return decodeCharacterTextColors(output(() => wasm.hwp5_edit_character_text_colors()).bytes);
    },
    characterShades() {
      check();
      if (typeof wasm.hwp5_edit_character_shades !== "function") throw new Error("Hwp5CharacterShadesAbiUnavailable");
      return decodeCharacterShades(output(() => wasm.hwp5_edit_character_shades()).bytes);
    },
    characterEffects() {
      check();
      if (typeof wasm.hwp5_edit_character_effects !== "function") throw new Error("Hwp5CharacterEffectsAbiUnavailable");
      return decodeCharacterEffects(output(() => wasm.hwp5_edit_character_effects()).bytes);
    },
    characterOutlines() {
      check();
      if (typeof wasm.hwp5_edit_character_outlines !== "function") throw new Error("Hwp5CharacterOutlinesAbiUnavailable");
      return decodeCharacterOutlines(output(() => wasm.hwp5_edit_character_outlines()).bytes);
    },
    characterStrikeStyles() {
      check();
      if (typeof wasm.hwp5_edit_character_strike_styles !== "function") throw new Error("Hwp5CharacterStrikeStylesAbiUnavailable");
      return decodeCharacterStrikeStyles(output(() => wasm.hwp5_edit_character_strike_styles()).bytes);
    },
    characterStrikes() {
      check();
      if (typeof wasm.hwp5_edit_character_strikes !== "function") throw new Error("Hwp5CharacterStrikesAbiUnavailable");
      return decodeCharacterStrikes(output(() => wasm.hwp5_edit_character_strikes()).bytes);
    },
    characterUnderlines() {
      check();
      if (typeof wasm.hwp5_edit_character_underlines !== "function") throw new Error("Hwp5CharacterUnderlinesAbiUnavailable");
      return decodeCharacterUnderlines(output(() => wasm.hwp5_edit_character_underlines()).bytes);
    },
    characterUnderlineStyles() {
      check();
      if (typeof wasm.hwp5_edit_character_underline_styles !== "function") throw new Error("Hwp5CharacterUnderlineStylesAbiUnavailable");
      return decodeCharacterUnderlineStyles(output(() => wasm.hwp5_edit_character_underline_styles()).bytes);
    },
    characterRanges(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_character_ranges !== "function") throw new Error("Hwp5CharacterRangesAbiUnavailable");
      return decodeCharacterRanges(output(() => wasm.hwp5_edit_character_ranges(u32(section, "section"), u32(paragraph, "paragraph"))).bytes);
    },
    tableBindings(section) {
      check();
      if (typeof wasm.hwp5_edit_table_bindings !== "function") throw new Error("Hwp5TableBindingsAbiUnavailable");
      return decodeTableBindings(output(() => wasm.hwp5_edit_table_bindings(u32(section, "section"))).bytes);
    },
    setCellSize({ section, listNode, width, height }) {
      check();
      const values = [u32(section, "section"), u32(listNode, "listNode"), u32(width, "width"), u32(height, "height")];
      if (typeof wasm.hwp5_edit_set_cell_size !== "function") throw new Error("Hwp5CellSizeAbiUnavailable");
      success(wasm.hwp5_edit_set_cell_size(...values));
    },
    setPictureCurrentSize({ section, pictureNode, width, height }) {
      check();
      const values = [u32(section, "section"), u32(pictureNode, "pictureNode"), u32(width, "width"), u32(height, "height")];
      if (typeof wasm.hwp5_edit_set_picture_current_size !== "function") throw new Error("Hwp5PictureCurrentSizeAbiUnavailable");
      success(wasm.hwp5_edit_set_picture_current_size(...values));
    },
    resizePicture({ section, pictureNode, width, height }) {
      check();
      const values = [u32(section, "section"), u32(pictureNode, "pictureNode"), u32(width, "width"), u32(height, "height")];
      if (typeof wasm.hwp5_edit_resize_picture !== "function") throw new Error("Hwp5PictureResizeAbiUnavailable");
      success(wasm.hwp5_edit_resize_picture(...values));
    },
    tablePlacements(section) {
      check();
      if (typeof wasm.hwp5_edit_table_placements !== "function") throw new Error("Hwp5TablePlacementsAbiUnavailable");
      return decodeTablePlacements(output(() => wasm.hwp5_edit_table_placements(u32(section, "section"))).bytes, "hwp5");
    },
    tableLayoutSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_table_layout_sources !== "function") throw new Error("Hwp5TableLayoutSourcesAbiUnavailable");
      return decodeHwp5TableLayoutSources(output(() => wasm.hwp5_edit_table_layout_sources(index)).bytes);
    },
    cellLayoutSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_cell_layout_sources !== "function") throw new Error("Hwp5CellLayoutSourcesAbiUnavailable");
      return decodeHwp5CellLayoutSources(output(() => wasm.hwp5_edit_cell_layout_sources(index)).bytes);
    },
    tableAnchors(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_table_anchors !== "function") throw new Error("Hwp5TableAnchorsAbiUnavailable");
      return decodeHwp5TableAnchors(output(() => wasm.hwp5_edit_table_anchors(index)).bytes);
    },
    structuralAnchors(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_structural_anchors !== "function") throw new Error("Hwp5StructuralAnchorsAbiUnavailable");
      return decodeHwp5StructuralAnchors(output(() => wasm.hwp5_edit_structural_anchors(index)).bytes);
    },
    noteShapeSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_note_shape_sources !== "function") throw new Error("Hwp5NoteShapeSourcesAbiUnavailable");
      return decodeHwp5NoteShapeSources(output(() => wasm.hwp5_edit_note_shape_sources(index)).bytes);
    },
    captionSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_caption_sources !== "function") throw new Error("Hwp5CaptionSourcesAbiUnavailable");
      return decodeHwp5CaptionSources(output(() => wasm.hwp5_edit_caption_sources(index)).bytes);
    },
    drawingSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_sources !== "function") throw new Error("Hwp5DrawingSourcesAbiUnavailable");
      return decodeHwp5DrawingSources(output(() => wasm.hwp5_edit_drawing_sources(index)).bytes);
    },
    drawingObjectExtras(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_object_extras !== "function") throw new Error("Hwp5DrawingObjectExtrasAbiUnavailable");
      return decodeHwp5DrawingObjectExtras(output(() => wasm.hwp5_edit_drawing_object_extras(index)).bytes);
    },
    drawingComponentSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_component_sources !== "function") throw new Error("Hwp5DrawingComponentSourcesAbiUnavailable");
      return decodeHwp5DrawingComponentSources(output(() => wasm.hwp5_edit_drawing_component_sources(index)).bytes);
    },
    drawingAnchors(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_anchors !== "function") throw new Error("Hwp5DrawingAnchorsAbiUnavailable");
      return decodeHwp5DrawingAnchors(output(() => wasm.hwp5_edit_drawing_anchors(index)).bytes);
    },
    drawingListSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_list_sources !== "function") throw new Error("Hwp5DrawingListSourcesAbiUnavailable");
      return decodeHwp5DrawingListSources(output(() => wasm.hwp5_edit_drawing_list_sources(index)).bytes);
    },
    drawingMatrixSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_matrix_sources !== "function") throw new Error("Hwp5DrawingMatrixSourcesAbiUnavailable");
      return decodeHwp5DrawingMatrixSources(output(() => wasm.hwp5_edit_drawing_matrix_sources(index)).bytes);
    },
    drawingLocalTransforms(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_local_transforms !== "function") throw new Error("Hwp5DrawingLocalTransformsAbiUnavailable");
      return decodeHwp5DrawingLocalTransforms(output(() => wasm.hwp5_edit_drawing_local_transforms(index)).bytes);
    },
    drawingRectangleCorners(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_rectangle_corners !== "function") throw new Error("Hwp5DrawingRectangleCornersAbiUnavailable");
      return decodeHwp5DrawingRectangleCorners(output(() => wasm.hwp5_edit_drawing_rectangle_corners(index)).bytes);
    },
    drawingLineEndpoints(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_line_endpoints !== "function") throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
      return decodeHwp5DrawingLineEndpoints(output(() => wasm.hwp5_edit_drawing_line_endpoints(index)).bytes);
    },
    noteSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_note_sources !== "function") throw new Error("Hwp5NoteSourcesAbiUnavailable");
      return decodeHwp5NoteSources(output(() => wasm.hwp5_edit_note_sources(index)).bytes);
    },
    drawingStyleSources(section, options) {
      check(); const index = u32(section, "section"), [border, tail] = drawingStyleLayoutArgs(options);
      if (typeof wasm.hwp5_edit_drawing_style_sources !== "function") throw new Error("Hwp5DrawingStyleSourcesAbiUnavailable");
      return decodeHwp5DrawingStyleSources(output(() => wasm.hwp5_edit_drawing_style_sources(index, border, tail)).bytes);
    },
    fileVersion() {
      check();
      if (typeof wasm.hwp5_edit_file_version !== "function") throw new Error("Hwp5FileVersionAbiUnavailable");
      const version = wasm.hwp5_edit_file_version();
      if (version === 0) throw memory.error();
      return version;
    },
    pictureSources(section, prefix) {
      check(); const index = u32(section, "section"), selection = picturePrefixArg(prefix);
      if (typeof wasm.hwp5_edit_picture_sources !== "function") throw new Error("Hwp5PictureSourcesAbiUnavailable");
      return decodeHwp5PictureSources(output(() => wasm.hwp5_edit_picture_sources(index, selection)).bytes);
    },
    pictureTailSources(section, layout) {
      check(); const index = u32(section, "section"), selection = pictureTailLayoutArg(layout);
      if (typeof wasm.hwp5_edit_picture_tail_sources !== "function") throw new Error("Hwp5PictureTailSourcesAbiUnavailable");
      return decodeHwp5PictureTailSources(output(() => wasm.hwp5_edit_picture_tail_sources(index, selection)).bytes);
    },
    binaryResource(ordinal, options = {}) {
      check();
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => key !== "maxBytes")) throw new Error("Invalid binary options");
      const { maxBytes = 32 * 1024 * 1024 } = options;
      const id = u32(ordinal, "binary ordinal"), limit = u32(maxBytes, "binary limit");
      if (id > 65535) throw new RangeError("Invalid binary ordinal");
      if (limit > 32 * 1024 * 1024) throw new RangeError("Invalid binary limit");
      if (typeof wasm.hwp5_edit_binary_resource !== "function") throw new Error("Hwp5BinaryResourceAbiUnavailable");
      return output(() => wasm.hwp5_edit_binary_resource(id, limit)).bytes;
    },
    automaticNumberSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_automatic_number_sources !== "function") throw new Error("Hwp5AutomaticNumberSourcesAbiUnavailable");
      return decodeHwp5AutomaticNumberSources(output(() => wasm.hwp5_edit_automatic_number_sources(index)).bytes);
    },
    pageControlSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_control_sources !== "function") throw new Error("Hwp5PageControlSourcesAbiUnavailable");
      return decodeHwp5PageControlSources(output(() => wasm.hwp5_edit_page_control_sources(index)).bytes);
    },
    documentProperties() {
      check();
      if (typeof wasm.hwp5_edit_document_properties !== "function") throw new Error("Hwp5DocumentPropertiesAbiUnavailable");
      return decodeHwp5DocumentProperties(output(() => wasm.hwp5_edit_document_properties()).bytes);
    },
    masterPageSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_master_page_sources !== "function") throw new Error("Hwp5MasterPageSourcesAbiUnavailable");
      return decodeHwp5MasterPageSources(output(() => wasm.hwp5_edit_master_page_sources(index)).bytes);
    },
    pageAreaSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_area_sources !== "function") throw new Error("Hwp5PageAreaSourcesAbiUnavailable");
      return decodeHwp5PageAreaSources(output(() => wasm.hwp5_edit_page_area_sources(index)).bytes);
    },
    pageSettings(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_settings !== "function") throw new Error("Hwp5PageSettingsAbiUnavailable");
      return decodeHwp5PageSettings(output(() => wasm.hwp5_edit_page_settings(index)).bytes);
    },
    sectionSettings(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_section_settings !== "function") throw new Error("Hwp5SectionSettingsAbiUnavailable");
      return decodeHwp5SectionSettings(output(() => wasm.hwp5_edit_section_settings(index)).bytes);
    },
    paragraphFlow(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_paragraph_flow !== "function") throw new Error("Hwp5ParagraphFlowAbiUnavailable");
      return decodeHwp5ParagraphFlow(output(() => wasm.hwp5_edit_paragraph_flow(index)).bytes);
    },
    columnSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_column_sources !== "function") throw new Error("Hwp5ColumnSourcesAbiUnavailable");
      return decodeHwp5ColumnSources(output(() => wasm.hwp5_edit_column_sources(index)).bytes);
    },
    copyText,
    fieldSpans(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_field_spans !== "function") throw new Error("Hwp5FieldSpansAbiUnavailable");
      return decodeHwp5FieldSpans(output(() => wasm.hwp5_edit_field_spans(index)).bytes);
    },
    supportsFieldTopology() {
      check(); return typeof wasm.hwp5_edit_field_topology === "function";
    },
    fieldTopology(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_field_topology !== "function") throw new Error("Hwp5FieldTopologyAbiUnavailable");
      return decodeHwp5FieldTopology(output(() => wasm.hwp5_edit_field_topology(index)).bytes);
    },
    formulaSources(section) {
      check(); const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_formula_sources !== "function") throw new Error("Hwp5FormulaSourcesAbiUnavailable");
      return decodeHwp5FormulaSources(output(() => wasm.hwp5_edit_formula_sources(index)).bytes);
    },
    setFormulaDefinition({ section, sourceNode, formula }) {
      check();
      const positions = [u32(section, "section"), u32(sourceNode, "sourceNode")];
      if (typeof wasm.hwp5_edit_set_formula_definition !== "function") throw new Error("Hwp5FormulaDefinitionAbiUnavailable");
      if (typeof formula !== "string") throw new TypeError("Formula must be a string");
      if (!formula.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
      if (formula.length > 4096) throw new RangeError("LimitExceeded");
      const bytes = encoder.encode(formula);
      if (bytes.length > 4096) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_formula_definition(...positions, ptr, size)));
    },
    text(section, paragraph) { check(); return decoder.decode(copyText(section, paragraph)); },
    splice({ section, paragraph, startUnit, endUnit, text, rangePolicy = "reject" }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (typeof text !== "string") throw new TypeError("Text must be a string");
      if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
      if (rangePolicy !== "reject" && rangePolicy !== "half-open") throw new Error("InvalidRangePolicy");
      if (text.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      const bytes = encoder.encode(text);
      if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_splice(...values, ptr, size, rangePolicy === "half-open" ? 1 : 0)));
    },
    splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), u32(atUnit, "atUnit")];
      u32(endUnit, "endUnit");
      if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
      if (endUnit !== atUnit) {
        if (typeof wasm.hwp5_edit_split_range !== "function") throw new Error("Hwp5StructureAbiUnavailable");
        success(wasm.hwp5_edit_split_range(...values, endUnit)); return;
      }
      if (typeof wasm.hwp5_edit_split !== "function") throw new Error("Hwp5StructureAbiUnavailable");
      success(wasm.hwp5_edit_split(...values));
    },
    mergeParagraph({ section, paragraph }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph")];
      if (typeof wasm.hwp5_edit_merge !== "function") throw new Error("Hwp5StructureAbiUnavailable");
      success(wasm.hwp5_edit_merge(...values));
    },
    setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
      check(); success(wasm.hwp5_edit_format(u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit"), u32(charShapeId, "charShapeId")));
    },
    setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwp5_edit_set_character_properties !== "function") throw new Error("Hwp5CharacterPropertiesAbiUnavailable");
      success(wasm.hwp5_edit_set_character_properties(...positions, ...args));
    },
    replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_font_name_properties : wasm.hwp5_edit_replace_paragraph_ranges_font_name;
      if (typeof action !== "function") throw new Error(args ? "Hwp5NamedFontPropertyReplacementAbiUnavailable" : "Hwp5NamedFontReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => success(action(ptr, size, tp, ts, font.language, np, ns, ...(args ?? []))))));
    },
    replaceParagraphRanges({ ranges, text, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_properties : wasm.hwp5_edit_replace_paragraph_ranges;
      if (typeof action !== "function") throw new Error(args ? "Hwp5PropertyReplacementAbiUnavailable" : "Hwp5ParagraphReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => success(action(ptr, size, tp, ts, ...(args ?? [])))));
    },
    setCharacterStrikeRanges({ ranges, enabled }) {
      check();
      const bytes = encodeCharacterRanges(ranges);
      if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwp5_edit_set_character_strike_ranges !== "function") throw new Error("Hwp5CharacterStrikeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_strike_ranges(ptr, size, Number(enabled))));
    },
    setCharacterUnderlineRanges({ ranges, kind }) {
      check();
      const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
      if (typeof wasm.hwp5_edit_set_character_underline_ranges !== "function") throw new Error("Hwp5CharacterUnderlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwp5_edit_set_character_underline_ranges(ptr, size, value)) throw memory.error();
      });
    },
    setCharacterPropertiesRanges({ ranges, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges);
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwp5_edit_set_character_properties_ranges !== "function") throw new Error("Hwp5CharacterPropertiesRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_properties_ranges(ptr, size, ...args)));
    },
    setCharacterFontNameRanges({ ranges, language, name }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
      if (typeof wasm.hwp5_edit_set_character_font_name_ranges !== "function") throw new Error("Hwp5CharacterFontNameRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
        if (!wasm.hwp5_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize)) throw memory.error();
      }));
    },
    setCharacterFontRanges({ ranges, language, fontId }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
      if (fontId > 65535) throw new RangeError("InvalidFontId");
      if (typeof wasm.hwp5_edit_set_character_font_ranges !== "function") throw new Error("Hwp5CharacterFontRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_ranges(ptr, size, ...args)));
    },
    setCharacterTextColorRanges({ ranges, color }) {
      check();
      const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_text_color_ranges !== "function") throw new Error("Hwp5CharacterTextColorRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_text_color_ranges(ptr, size, value)));
    },
    setCharacterShadeRanges({ ranges, color }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
      if (typeof wasm.hwp5_edit_set_character_shade_ranges !== "function") throw new Error("Hwp5CharacterShadeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_shade_ranges(ptr, size, ...args)));
    },
    setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_ranges_exclusive : wasm.hwp5_edit_set_character_effect_ranges;
      if (typeof method !== "function") throw new Error(exclusive ? "Hwp5CharacterEffectRangesExclusiveAbiUnavailable" : "Hwp5CharacterEffectRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(method(ptr, size, ...args)));
    },
    setCharacterOutlineRanges({ ranges, kind }) {
      check(); const bytes = encodeCharacterRanges(ranges), value = hwp5CharacterOutlineArg(kind);
      const action = value > 1 ? wasm.hwp5_edit_set_character_outline_ranges_extended : wasm.hwp5_edit_set_character_outline_ranges;
      if (typeof action !== "function") throw new Error(value > 1 ? "Hwp5CharacterOutlineRangesExtendedAbiUnavailable" : "Hwp5CharacterOutlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(action(ptr, size, value)));
    },
    setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwp5_edit_set_character_strike !== "function") throw new Error("Hwp5CharacterStrikeAbiUnavailable");
      success(wasm.hwp5_edit_set_character_strike(...positions, Number(enabled)));
    },
    setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterUnderlineArg(kind);
      if (typeof wasm.hwp5_edit_set_character_underline !== "function") throw new Error("Hwp5CharacterUnderlineAbiUnavailable");
      success(wasm.hwp5_edit_set_character_underline(...positions, value));
    },
    setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_underline_color !== "function") throw new Error("Hwp5CharacterUnderlineColorAbiUnavailable");
      success(wasm.hwp5_edit_set_character_underline_color(...positions, value));
    },
    setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterFontArgs(language, fontId);
      if (fontId > 65535) throw new RangeError("InvalidFontId");
      if (typeof wasm.hwp5_edit_set_character_font !== "function") throw new Error("Hwp5CharacterFontAbiUnavailable");
      success(wasm.hwp5_edit_set_character_font(...positions, ...args));
    },
    setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterFontNameArgs(language, name);
      if (typeof wasm.hwp5_edit_set_character_font_name !== "function") throw new Error("Hwp5CharacterFontNameAbiUnavailable");
      memory.withBytes(args.bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_name(...positions, args.language, ptr, size)));
    },
    spliceWithCharacterProperties(input) {
      check();
      const { positions, bytes } = textTransactionArgs(input);
      const properties = characterPropertyArgs(input.properties);
      const action = wasm.hwp5_edit_splice_character_properties;
      if (typeof action !== "function") throw new Error("Hwp5CharacterPropertyTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(action(...positions, ptr, size, ...properties)));
    },
    spliceWithFontName(input) {
      check();
      const { positions, bytes, font } = namedFontTextArgs(input);
      const properties = input.properties === undefined ? null : characterPropertyArgs(input.properties);
      const action = properties ? wasm.hwp5_edit_splice_font_name_properties : wasm.hwp5_edit_splice_font_name;
      if (typeof action !== "function") throw new Error(properties ? "Hwp5NamedFontPropertyTextAbiUnavailable" : "Hwp5NamedFontTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => success(action(...positions, ptr, size, font.language, namePtr, nameSize, ...(properties ?? [])))));
    },
    setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_text_color !== "function") throw new Error("Hwp5CharacterTextColorAbiUnavailable");
      success(wasm.hwp5_edit_set_character_text_color(...positions, value));
    },
    setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterShadeArgs(color);
      if (typeof wasm.hwp5_edit_set_character_shade !== "function") throw new Error("Hwp5CharacterShadeAbiUnavailable");
      success(wasm.hwp5_edit_set_character_shade(...positions, ...args));
    },
    setCharacterEffect({ section, paragraph, startUnit, endUnit, effect, enabled, exclusive = false }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_exclusive : wasm.hwp5_edit_set_character_effect;
      if (typeof method !== "function") throw new Error(exclusive ? "Hwp5CharacterEffectExclusiveAbiUnavailable" : "Hwp5CharacterEffectAbiUnavailable");
      success(method(...positions, ...args));
    },
    setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
      check();
      const positions = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = hwp5CharacterOutlineArg(kind);
      const action = value > 1 ? wasm.hwp5_edit_set_character_outline_extended : wasm.hwp5_edit_set_character_outline;
      if (typeof action !== "function") throw new Error(value > 1 ? "Hwp5CharacterOutlineExtendedAbiUnavailable" : "Hwp5CharacterOutlineAbiUnavailable");
      success(action(...positions, value));
    },
    save({ allowStaleLayout = false } = {}) {
      check(); if (typeof allowStaleLayout !== "boolean") throw new TypeError("allowStaleLayout must be boolean");
      return output(() => wasm.hwp5_edit_save(allowStaleLayout ? 1 : 0));
    },
    close() { if (!closed) wasm.hwp5_edit_close(); closed = true; },
  };
}
