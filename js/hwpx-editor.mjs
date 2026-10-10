import { createMemory } from "./wasm-memory.mjs";
import { decodeCreatedTables } from "./hwpx-created-tables.mjs";
import { createdTableIdentity } from "./created-table-identity.mjs";
import { decodeFormSourceNodes, decodeFormSourceAttributes, decodeFormSites, decodeFormSourceLayout } from "./hwpx-form-source.mjs";
import { decodeCharacterEffects } from "./character-effects.mjs";
import { characterEffectArgs, characterEffectMode } from "./character-effect-args.mjs";
import { characterOutlineArg } from "./character-outline-args.mjs";
import { decodeCharacterOutlines } from "./character-outlines.mjs";
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
import { decodeFontFaces } from "./font-faces.mjs";
import { decodeCharacterFontReferences } from "./character-font-references.mjs";
import { decodeCharacterUnderlineStyles } from "./character-underline-styles.mjs";
import { decodeHwpxParagraphShapes } from "./hwpx-paragraph-shapes.mjs";
import { decodeTableBindings } from "./table-bindings-wire.mjs";
import { decodeTablePlacements } from "./table-placements-wire.mjs";
import { decodeDrawingTextBindings } from "./hwpx-drawing-text-bindings.mjs";
import { decodeDrawingTextSnapshot } from "./hwpx-drawing-text-snapshot.mjs";
import { decodeDrawingTextSnapshots } from "./hwpx-drawing-text-snapshots.mjs";
import { decodeContainerSource } from "./hwpx-container-source.mjs";
import { decodeRectangleRenderingSource } from "./hwpx-rectangle-rendering-source.mjs";
import { decodeRectangleRenderingSources } from "./hwpx-rectangle-rendering-sources.mjs";
import { decodeFillBrushes } from "./hwpx-fill-brushes.mjs";
import { decodePictureSites } from "./hwpx-picture-sites-wire.mjs";
import { decodePictureOwner } from "./hwpx-picture-owner-wire.mjs";
import { decodePictureRenderingCorners } from "./hwpx-picture-corners-wire.mjs";
import { decodePicturePosition } from "./hwpx-picture-position-wire.mjs";
import { decodePictureFlow } from "./hwpx-picture-flow-wire.mjs";
import { decodePictureGeometry } from "./hwpx-picture-geometry-wire.mjs";
import { decodeLineNodes, decodeLineDisplay, decodeLinePlacement } from "./hwpx-line-display-wire.mjs";
import { decodeConnectorNodes, decodeConnectorSource, decodeConnectorOwner, decodeConnectorRenderingSource } from "./hwpx-connector-source.mjs";
import { decodeDrawingStrokeSource } from "./hwpx-drawing-stroke-source.mjs";
import { decodeLineGeometry } from "./hwpx-line-geometry.mjs";
import { decodeDrawingPlacement } from "./hwpx-drawing-placement-wire.mjs";
import { decodePageSettings, decodeParagraphFlow } from "./hwpx-page-settings.mjs";
import { decodeNoteShapes } from "./hwpx-note-shapes.mjs";
import { decodeTablePagination } from "./hwpx-table-pagination.mjs";
import { decodeTableGeometry } from "./hwpx-table-geometry.mjs";
import { decodeTableCaption } from "./hwpx-table-caption.mjs";
import { decodeTableCaptionBindings } from "./hwpx-table-caption-bindings.mjs";
import { decodeAutomaticNumberSites } from "./hwpx-automatic-number-sites.mjs";
import { decodeAutomaticNumberSources } from "./hwpx-automatic-number-sources.mjs";
import { decodeNoteReferenceSites } from "./hwpx-note-reference-sites.mjs";
import { decodeParagraphTextSnapshot } from "./hwpx-paragraph-text-snapshot.mjs";
import { decodeFormulaFieldSources } from "./hwpx-formula-field-sources.mjs";
import { decodeTableCellMargin } from "./hwpx-table-cell-margin.mjs";
import { decodeFormulaSources } from "./hwpx-formula-sources.mjs";
import { decodePictureCrop } from "./hwpx-picture-crop-wire.mjs";
import { decodePictureTransform } from "./hwpx-picture-transform-wire.mjs";
import { decodeCharacterShapes, decodeCharacterRanges } from "./hwpx-character-shapes-wire.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";
import { createHistoryApi } from "./editor-history.mjs";

/** Experimental plain-paragraph editing; paragraph numbers are document-wide, 1-based. */
export async function createHwpxEditor(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const suffix of ["open", "close", "section_count", "can_edit", "splice", "save", "output_ptr", "output_len", "output_free"])
    if (typeof wasm[`hwpx_edit_${suffix}`] !== "function") throw new Error("HwpxEditAbiUnavailable");
  const memory = createMemory(wasm);
  let closed = false;
  function ready() { if (closed) throw new Error("EditorClosed"); }
  function uint(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("InvalidInteger");
    return value;
  }
  function encodedText(text) {
    if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidText");
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
    return bytes;
  }
  function paragraphIds(suffix, args = []) {
    ready(); args.forEach(uint);
    const action = wasm[`hwpx_edit_${suffix}`];
    if (typeof action !== "function") throw new Error("HwpxParagraphFormatAbiUnavailable");
    try {
      if (!action(...args)) throw memory.error();
      const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      if (bytes.length % 4 || (suffix === "paragraph_shape_id" && bytes.length !== 4)) throw new Error("InvalidParagraphShapeIds");
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
    } finally { wasm.hwpx_edit_output_free(); }
  }
  return {
    paragraphShapeIds() { return paragraphIds("paragraph_shape_ids"); },
    paragraphNeighbors(section) {
      const values = paragraphIds("paragraph_neighbors", [section]);
      if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2) throw new Error("InvalidParagraphNeighbors");
      const firstParagraph = values[0], next = values.slice(2);
      for (const [index, value] of next.entries()) if (value !== 0 && (value <= firstParagraph + index || value >= firstParagraph + next.length)) throw new Error("InvalidParagraphNeighbors");
      return { firstParagraph, next: next.map(value => value === 0 ? null : value) };
    },
    paragraphShapeRefs(section) {
      const values = paragraphIds("paragraph_shape_refs", [section]);
      if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2) throw new Error("InvalidParagraphShapeIds");
      return { firstParagraph: values[0], ids: values.slice(2) };
    },
    paragraphShapeId(section, paragraph) { return paragraphIds("paragraph_shape_id", [section, paragraph])[0]; },
    setParagraphFormat({ section, paragraph, paraShapeId }) {
      ready(); [section, paragraph, paraShapeId].forEach(uint);
      if (typeof wasm.hwpx_edit_set_paragraph_format !== "function") throw new Error("HwpxParagraphFormatAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_format(section, paragraph, paraShapeId)) throw memory.error();
    },
    setParagraphAlignment({ section, paragraph, alignment }) {
      ready(); [section, paragraph].forEach(uint);
      const value = ["LEFT", "RIGHT", "CENTER", "JUSTIFY", "DISTRIBUTE", "DISTRIBUTE_SPACE"].indexOf(alignment);
      if (value < 0) throw new RangeError("InvalidParagraphAlignment");
      if (typeof wasm.hwpx_edit_set_paragraph_alignment !== "function") throw new Error("HwpxParagraphAlignmentAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_alignment(section, paragraph, value)) throw memory.error();
    },
    setParagraphMargins({ section, paragraph, margins }) {
      ready(); [section, paragraph].forEach(uint);
      const args = paragraphMarginArgs(margins);
      if (typeof wasm.hwpx_edit_set_paragraph_margins !== "function") throw new Error("HwpxParagraphMarginsAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_margins(section, paragraph, ...args)) throw memory.error();
    },
    setParagraphSpacing({ section, paragraph, type, value }) {
      ready(); [section, paragraph].forEach(uint);
      const args = paragraphSpacingArgs(type, value);
      if (typeof wasm.hwpx_edit_set_paragraph_spacing !== "function") throw new Error("HwpxParagraphSpacingAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_spacing(section, paragraph, ...args)) throw memory.error();
    },
    ...createHistoryApi({ wasm, memory, check: ready, uint, prefix: "hwpx_edit", unavailable: "HwpxHistoryAbiUnavailable" }),
    canEditOutsideField(section, paragraph, startUnit, endUnit) {
      ready(); [section, paragraph, startUnit, endUnit].forEach(uint);
      if (typeof wasm.hwpx_edit_can_edit_outside_field !== "function") throw new Error("HwpxOutsideFieldQueryAbiUnavailable");
      const result = wasm.hwpx_edit_can_edit_outside_field(section, paragraph, startUnit, endUnit);
      if (result > 1) throw memory.error();
      return result === 1;
    },
    canEdit(section, paragraph) {
      ready(); uint(section); uint(paragraph);
      const result = wasm.hwpx_edit_can_edit(section, paragraph);
      if (result > 1) throw memory.error();
      return result === 1;
    },
    canSplitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready(); [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_can_split !== "function") throw new Error("HwpxSplitQueryAbiUnavailable");
      const result = wasm.hwpx_edit_can_split(section, paragraph, atUnit, endUnit - atUnit);
      if (result > 1) throw memory.error();
      return result === 1;
    },
    open(data) {
      ready();
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_open(ptr, size)) throw memory.error();
      });
      return { sectionCount: wasm.hwpx_edit_section_count() };
    },
    splice(section, paragraph, start, deleted, text) {
      ready();
      [section, paragraph, start, deleted].forEach(uint);
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice(section, paragraph, start, deleted, ptr, size)) throw memory.error();
      });
    },
    splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_split !== "function") throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_split(section, paragraph, atUnit, endUnit - atUnit)) throw memory.error();
    },
    splitParagraphAnchored({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_split_anchored !== "function") throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_split_anchored(section, paragraph, atUnit, endUnit - atUnit)) throw memory.error();
    },
    mergeParagraph({ section, paragraph }) {
      ready(); [section, paragraph].forEach(uint);
      if (typeof wasm.hwpx_edit_merge !== "function") throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_merge(section, paragraph)) throw memory.error();
    },
    mergeParagraphPair({ section, paragraph, rightParagraph }) {
      ready(); [section, paragraph, rightParagraph].forEach(uint);
      if (typeof wasm.hwpx_edit_merge_pair !== "function") throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_merge_pair(section, paragraph, rightParagraph)) throw memory.error();
    },
    setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
      ready();
      [section, paragraph, startUnit, endUnit, charShapeId].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_set_character_format !== "function") throw new Error("HwpxCharacterFormatAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_format(section, paragraph, startUnit, endUnit, charShapeId)) throw memory.error();
    },
    setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwpx_edit_set_character_properties !== "function") throw new Error("HwpxCharacterPropertiesAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_properties(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
    },
    replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_font_name_properties : wasm.hwpx_edit_replace_paragraph_ranges_font_name;
      if (typeof action !== "function") throw new Error(args ? "HwpxNamedFontPropertyReplacementAbiUnavailable" : "HwpxNamedFontReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => {
        if (!action(ptr, size, tp, ts, font.language, np, ns, ...(args ?? []))) throw memory.error();
      })));
    },
    replaceParagraphRanges({ ranges, text, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_properties : wasm.hwpx_edit_replace_paragraph_ranges;
      if (typeof action !== "function") throw new Error(args ? "HwpxPropertyReplacementAbiUnavailable" : "HwpxParagraphReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => {
        if (!action(ptr, size, tp, ts, ...(args ?? []))) throw memory.error();
      }));
    },
    setCharacterStrikeRanges({ ranges, enabled }) {
      ready();
      const bytes = encodeCharacterRanges(ranges);
      if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwpx_edit_set_character_strike_ranges !== "function") throw new Error("HwpxCharacterStrikeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_strike_ranges(ptr, size, Number(enabled))) throw memory.error();
      });
    },
    setCharacterUnderlineRanges({ ranges, kind }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_underline_ranges !== "function") throw new Error("HwpxCharacterUnderlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_underline_ranges(ptr, size, value)) throw memory.error();
      });
    },
    setCharacterPropertiesRanges({ ranges, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges);
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwpx_edit_set_character_properties_ranges !== "function") throw new Error("HwpxCharacterPropertiesRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_properties_ranges(ptr, size, ...args)) throw memory.error();
      });
    },
    setCharacterFontNameRanges({ ranges, language, name }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
      if (typeof wasm.hwpx_edit_set_character_font_name_ranges !== "function") throw new Error("HwpxCharacterFontNameRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
        if (!wasm.hwpx_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize)) throw memory.error();
      }));
    },
    setCharacterFontRanges({ ranges, language, fontId }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
      if (typeof wasm.hwpx_edit_set_character_font_ranges !== "function") throw new Error("HwpxCharacterFontRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_font_ranges(ptr, size, ...args)) throw memory.error();
      });
    },
    setCharacterTextColorRanges({ ranges, color }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_text_color_ranges !== "function") throw new Error("HwpxCharacterTextColorRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_text_color_ranges(ptr, size, value)) throw memory.error();
      });
    },
    setCharacterShadeRanges({ ranges, color }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
      if (typeof wasm.hwpx_edit_set_character_shade_ranges !== "function") throw new Error("HwpxCharacterShadeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_shade_ranges(ptr, size, ...args)) throw memory.error();
      });
    },
    setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_ranges_exclusive : wasm.hwpx_edit_set_character_effect_ranges;
      if (typeof method !== "function") throw new Error(exclusive ? "HwpxCharacterEffectRangesExclusiveAbiUnavailable" : "HwpxCharacterEffectRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!method(ptr, size, ...args)) throw memory.error();
      });
    },
    setCharacterOutlineRanges({ ranges, kind }) {
      ready(); const bytes = encodeCharacterRanges(ranges), value = characterOutlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_outline_ranges !== "function") throw new Error("HwpxCharacterOutlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_outline_ranges(ptr, size, value)) throw memory.error();
      });
    },
    setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwpx_edit_set_character_strike !== "function") throw new Error("HwpxCharacterStrikeAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_strike(section, paragraph, startUnit, endUnit, Number(enabled))) throw memory.error();
    },
    setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterUnderlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_underline !== "function") throw new Error("HwpxCharacterUnderlineAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_underline(section, paragraph, startUnit, endUnit, value)) throw memory.error();
    },
    setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_underline_color !== "function") throw new Error("HwpxCharacterUnderlineColorAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_underline_color(section, paragraph, startUnit, endUnit, value)) throw memory.error();
    },
    setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
      ready();
      for (const [name, value] of Object.entries({ section, paragraph, startUnit, endUnit })) {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`Invalid ${name}`);
      }
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterFontArgs(language, fontId);
      if (typeof wasm.hwpx_edit_set_character_font !== "function") throw new Error("HwpxCharacterFontAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_font(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
    },
    setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
      ready();
      for (const [key, value] of Object.entries({ section, paragraph, startUnit, endUnit })) {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`Invalid ${key}`);
      }
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterFontNameArgs(language, name);
      if (typeof wasm.hwpx_edit_set_character_font_name !== "function") throw new Error("HwpxCharacterFontNameAbiUnavailable");
      memory.withBytes(args.bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_font_name(section, paragraph, startUnit, endUnit, args.language, ptr, size)) throw memory.error();
      });
    },
    spliceWithCharacterProperties(input) {
      ready();
      const { positions, bytes } = textTransactionArgs(input);
      const properties = characterPropertyArgs(input.properties);
      const mode = input.textMode ?? "plain";
      if (!["plain", "anchored", "field"].includes(mode)) throw new RangeError("InvalidTextKind");
      const begin = input.beginElement ?? 0;
      uint(begin);
      const action = mode === "plain" ? wasm.hwpx_edit_splice_character_properties : wasm.hwpx_edit_splice_character_properties_protected;
      if (typeof action !== "function") throw new Error("HwpxCharacterPropertyTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        const extra = mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
        if (!action(...positions, ptr, size, ...properties, ...extra)) throw memory.error();
      });
    },
    spliceWithFontName(input) {
      ready();
      const { positions, bytes, font } = namedFontTextArgs(input);
      const mode = input.textMode ?? "plain", begin = input.beginElement ?? 0;
      if (!["plain", "anchored", "field"].includes(mode)) throw new RangeError("InvalidTextKind");
      uint(begin);
      const properties = input.properties === undefined ? null : characterPropertyArgs(input.properties);
      const action = properties ? wasm.hwpx_edit_splice_font_name_properties : mode === "plain" ? wasm.hwpx_edit_splice_font_name : wasm.hwpx_edit_splice_font_name_protected;
      if (typeof action !== "function") throw new Error(properties ? "HwpxNamedFontPropertyTextAbiUnavailable" : "HwpxNamedFontTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => {
        const extra = properties ? [...properties, mode === "plain" ? 0 : mode === "anchored" ? 1 : 2, begin] : mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
        if (!action(...positions, ptr, size, font.language, namePtr, nameSize, ...extra)) throw memory.error();
      }));
    },
    setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_text_color !== "function") throw new Error("HwpxCharacterTextColorAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_text_color(section, paragraph, startUnit, endUnit, value)) throw memory.error();
    },
    setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterShadeArgs(color);
      if (typeof wasm.hwpx_edit_set_character_shade !== "function") throw new Error("HwpxCharacterShadeAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_shade(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
    },
    setCharacterEffect({ section, paragraph, startUnit, endUnit, effect, enabled, exclusive = false }) {
      ready(); [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_exclusive : wasm.hwpx_edit_set_character_effect;
      if (typeof method !== "function") throw new Error(exclusive ? "HwpxCharacterEffectExclusiveAbiUnavailable" : "HwpxCharacterEffectAbiUnavailable");
      if (!method(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
    },
    setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
      ready(); [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
      const value = characterOutlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_outline !== "function") throw new Error("HwpxCharacterOutlineAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_outline(section, paragraph, startUnit, endUnit, value)) throw memory.error();
    },
    setCellSize({ section, listNode, width, height }) {
      ready();
      [section, listNode, width, height].forEach(uint);
      if (typeof wasm.hwpx_edit_set_cell_size !== "function") throw new Error("HwpxCellSizeAbiUnavailable");
      if (!wasm.hwpx_edit_set_cell_size(section, listNode, width, height)) throw memory.error();
    },
    setPictureDimensions({ section, pictureNode, display, original, current }) {
      ready();
      [section, pictureNode].forEach(uint);
      let mask = 0;
      const values = [];
      for (const [index, pair] of [display, original, current].entries()) {
        if (pair === undefined || pair === null) { values.push(0, 0); continue; }
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError("InvalidPictureDimensionPair");
        const width = pair[0], height = pair[1];
        uint(width); uint(height);
        mask |= 1 << index;
        values.push(width, height);
      }
      if (typeof wasm.hwpx_edit_set_picture_dimensions !== "function") throw new Error("HwpxPictureDimensionsAbiUnavailable");
      if (!wasm.hwpx_edit_set_picture_dimensions(section, pictureNode, mask, ...values)) throw memory.error();
    },
    resizePicture({ section, pictureNode, width, height }) {
      ready();
      [section, pictureNode, width, height].forEach(uint);
      if (width === 0 || height === 0) throw new RangeError("InvalidResizeAxisSize");
      if (typeof wasm.hwpx_edit_resize_picture !== "function") throw new Error("HwpxPictureResizeAbiUnavailable");
      if (!wasm.hwpx_edit_resize_picture(section, pictureNode, width, height)) throw memory.error();
    },
    groupedPictureResizeAvailable(section, pictureNode) {
      ready(); [section, pictureNode].forEach(uint);
      if (typeof wasm.hwpx_edit_group_picture_resize_available !== "function") throw new Error("HwpxGroupedPictureResizeAbiUnavailable");
      if (!wasm.hwpx_edit_group_picture_resize_available(section, pictureNode)) throw memory.error();
      return true;
    },
    characterShapeIds() {
      ready();
      if (typeof wasm.hwpx_edit_character_shape_ids !== "function") throw new Error("HwpxCharacterFormatAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shape_ids()) throw memory.error();
        const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
        if (bytes.length % 4 !== 0) throw new Error("InvalidCharacterShapeIds");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    paragraphShapes() {
      ready();
      if (typeof wasm.hwpx_edit_paragraph_shapes !== "function") throw new Error("HwpxParagraphShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_shapes()) throw memory.error();
        return decodeHwpxParagraphShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterShapes() {
      ready();
      if (typeof wasm.hwpx_edit_character_shapes !== "function") throw new Error("HwpxCharacterShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shapes()) throw memory.error();
        return decodeCharacterShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterFontReferences() {
      ready();
      if (typeof wasm.hwpx_edit_character_font_references !== "function") throw new Error("HwpxCharacterFontReferencesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_font_references()) throw memory.error();
        return decodeCharacterFontReferences(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    fontFaces() {
      ready();
      if (typeof wasm.hwpx_edit_font_faces !== "function") throw new Error("HwpxFontFacesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_font_faces()) throw memory.error();
        return decodeFontFaces(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterTextColors() {
      ready();
      if (typeof wasm.hwpx_edit_character_text_colors !== "function") throw new Error("HwpxCharacterTextColorsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_text_colors()) throw memory.error();
        return decodeCharacterTextColors(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterShades() {
      ready();
      if (typeof wasm.hwpx_edit_character_shades !== "function") throw new Error("HwpxCharacterShadesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shades()) throw memory.error();
        return decodeCharacterShades(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterEffects() {
      ready();
      if (typeof wasm.hwpx_edit_character_effects !== "function") throw new Error("HwpxCharacterEffectsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_effects()) throw memory.error();
        return decodeCharacterEffects(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterOutlines() {
      ready();
      if (typeof wasm.hwpx_edit_character_outlines !== "function") throw new Error("HwpxCharacterOutlinesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_outlines()) throw memory.error();
        return decodeCharacterOutlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterStrikeStyles() {
      ready();
      if (typeof wasm.hwpx_edit_character_strike_styles !== "function") throw new Error("HwpxCharacterStrikeStylesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_strike_styles()) throw memory.error();
        return decodeCharacterStrikeStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterStrikes() {
      ready();
      if (typeof wasm.hwpx_edit_character_strikes !== "function") throw new Error("HwpxCharacterStrikesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_strikes()) throw memory.error();
        return decodeCharacterStrikes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterUnderlines() {
      ready();
      if (typeof wasm.hwpx_edit_character_underlines !== "function") throw new Error("HwpxCharacterUnderlinesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_underlines()) throw memory.error();
        return decodeCharacterUnderlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterUnderlineStyles() {
      ready();
      if (typeof wasm.hwpx_edit_character_underline_styles !== "function") throw new Error("HwpxCharacterUnderlineStylesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_underline_styles()) throw memory.error();
        return decodeCharacterUnderlineStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableBindings(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_table_bindings !== "function") throw new Error("HwpxTableBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_bindings(section)) throw memory.error();
        return decodeTableBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tablePlacements(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_table_placements !== "function") throw new Error("HwpxTablePlacementsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_placements(section)) throw memory.error();
        return decodeTablePlacements(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    drawingTextBindings(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_drawing_text_bindings !== "function") throw new Error("HwpxDrawingTextBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_bindings(section)) throw memory.error();
        return decodeDrawingTextBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    drawingTextSnapshot(section, drawingNode) {
      ready(); uint(section); uint(drawingNode);
      if (typeof wasm.hwpx_edit_drawing_text_snapshot !== "function") throw new Error("HwpxDrawingTextSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_snapshot(section, drawingNode)) throw memory.error();
        return decodeDrawingTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    drawingTextSnapshots(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_drawing_text_snapshots !== "function") throw new Error("HwpxDrawingTextSnapshotsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_snapshots(section)) throw memory.error();
        return decodeDrawingTextSnapshots(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    sectionFillBrushes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_section_fill_brushes !== "function") throw new Error("HwpxFillBrushesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_section_fill_brushes(section)) throw memory.error();
        return decodeFillBrushes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    rectangleNodes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_rectangle_nodes !== "function") throw new Error("HwpxRectangleNodesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_nodes(section)) throw memory.error();
        const nodes = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
        if (!Array.isArray(nodes) || !nodes.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && (i === 0 || n > nodes[i - 1]))) throw new Error("InvalidRectangleNodes");
        return nodes;
      } finally { wasm.hwpx_edit_output_free(); }
    },
    rectangleRenderingSource(section, rectangleNode) {
      ready(); uint(section); uint(rectangleNode);
      if (typeof wasm.hwpx_edit_rectangle_rendering_source !== "function") throw new Error("HwpxRectangleRenderingSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_rendering_source(section, rectangleNode)) throw memory.error();
        return decodeRectangleRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    rectangleRenderingSources(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_rectangle_rendering_sources !== "function") throw new Error("HwpxRectangleRenderingSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_rendering_sources(section)) throw memory.error();
        return decodeRectangleRenderingSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableCreationResources() {
      ready();
      if (typeof wasm.hwpx_edit_table_creation_resources !== "function") throw new Error("HwpxTableCreationResourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_creation_resources()) throw memory.error();
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
        const keys = ["paragraph", "character", "style", "border_fill"];
        if (!value || typeof value !== "object" || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key) && Array.isArray(value[key]) && value[key].every((id, i, ids) => Number.isInteger(id) && id >= 0 && id <= 0xffffffff && (!i || ids[i - 1] < id)))) throw new Error("InvalidTableCreationResources");
        return value;
      } finally { wasm.hwpx_edit_output_free(); }
    },
    saveForDisplay() {
      ready();
      try {
        const save = typeof wasm.hwpx_edit_save_for_display === "function" ? wasm.hwpx_edit_save_for_display : wasm.hwpx_edit_save;
        if (!save()) throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally { wasm.hwpx_edit_output_free(); }
    },
    insertTable(section, paragraph, unit, options) {
      ready(); [section, paragraph, unit].forEach(uint);
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("InvalidTableCreationOptions");
      const { rows, columns, width, rowHeight, resources } = options;
      if (!resources || typeof resources !== "object" || Array.isArray(resources)) throw new TypeError("InvalidTableCreationResources");
      const args = [rows, columns, width, rowHeight, resources.paragraph, resources.character, resources.style, resources.border_fill];
      args.forEach(uint);
      if (typeof wasm.hwpx_edit_insert_table !== "function") throw new Error("HwpxTableCreationAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_insert_table(section, paragraph, unit, ...args)) throw memory.error();
        const identity = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
        createdTableIdentity(identity);
        return identity;
      } finally { wasm.hwpx_edit_output_free(); }
    },
    createdTables(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_created_tables !== "function") throw new Error("HwpxCreatedTablesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_created_tables(section)) throw memory.error();
        return decodeCreatedTables(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    setCreatedCellText(section, identity, row, column, text) {
      ready(); [section, row, column].forEach(uint);
      const id = createdTableIdentity(identity);
      const bytes = encodedText(text);
      if (typeof wasm.hwpx_edit_set_created_cell_text !== "function") throw new Error("HwpxCreatedCellTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_created_cell_text(section, Number(id & 0xffffffffn), Number(id >> 32n), row, column, ptr, size)) throw memory.error();
      });
    },
    containerSourceSnapshot(section, containerNode) {
      ready(); uint(section); uint(containerNode);
      if (typeof wasm.hwpx_edit_container_source_snapshot !== "function") throw new Error("HwpxContainerSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_container_source_snapshot(section, containerNode)) throw memory.error();
        return decodeContainerSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureSites(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_picture_sites !== "function") throw new Error("HwpxPictureSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_sites(section)) throw memory.error();
        return decodePictureSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureFlow(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_flow !== "function") throw new Error("HwpxPictureFlowAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_flow(section, pictureNode)) throw memory.error();
        return decodePictureFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    picturePosition(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_position !== "function") throw new Error("HwpxPicturePositionAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_position(section, pictureNode)) throw memory.error();
        return decodePicturePosition(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureRenderingCorners(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_rendering_corners !== "function") throw new Error("HwpxPictureCornersAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_rendering_corners(section, pictureNode)) throw memory.error();
        return decodePictureRenderingCorners(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureOwner(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_owner !== "function") throw new Error("HwpxPictureOwnerAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_owner(section, pictureNode)) throw memory.error();
        return decodePictureOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    lineNodes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_line_nodes !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_nodes(section)) throw memory.error();
        return decodeLineNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    lineGeometry(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_line_geometry !== "function") throw new Error("HwpxLineGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_geometry(section, node)) throw memory.error();
        return decodeLineGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally { wasm.hwpx_edit_output_free(); }
    },
    connectorNodes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_connector_nodes !== "function") throw new Error("HwpxConnectorSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_nodes(section)) throw memory.error();
        return decodeConnectorNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    connectorGeometrySource(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_connector_geometry_source !== "function") throw new Error("HwpxConnectorSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_geometry_source(section, node)) throw memory.error();
        return decodeConnectorSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    drawingStrokeSource(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_drawing_stroke_source !== "function") throw new Error("HwpxDrawingStrokeSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_stroke_source(section, node)) throw memory.error();
        return decodeDrawingStrokeSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally { wasm.hwpx_edit_output_free(); }
    },
    connectorOwner(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_connector_owner !== "function") throw new Error("HwpxConnectorOwnerAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_owner(section, node)) throw memory.error();
        return decodeConnectorOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally { wasm.hwpx_edit_output_free(); }
    },
    connectorRenderingSource(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_connector_rendering_source !== "function") throw new Error("HwpxConnectorRenderingSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_rendering_source(section, node)) throw memory.error();
        return decodeConnectorRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally { wasm.hwpx_edit_output_free(); }
    },
    connectorPlacementSource(section, node) {
      ready(); uint(section); uint(node);
      if (typeof wasm.hwpx_edit_connector_placement_source !== "function") throw new Error("HwpxConnectorPlacementSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_placement_source(section, node)) throw memory.error();
        return { sourceOnly: true, ...decodeDrawingPlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "InvalidConnectorPlacementSource") };
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pageSettings() {
      ready();
      if (typeof wasm.hwpx_edit_page_settings !== "function") throw new Error("HwpxPageSettingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_page_settings()) throw memory.error();
        return decodePageSettings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    noteShapes() {
      ready();
      if (typeof wasm.hwpx_edit_note_shapes !== "function") throw new Error("HwpxNoteShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_note_shapes()) throw memory.error();
        return decodeNoteShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    paragraphFlow(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_paragraph_flow !== "function") throw new Error("HwpxParagraphFlowAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_flow(section)) throw memory.error();
        return decodeParagraphFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tablePagination(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_table_pagination !== "function") throw new Error("HwpxTablePaginationAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_pagination(section)) throw memory.error();
        return decodeTablePagination(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableGeometry(section, tableNode) {
      ready(); uint(section); uint(tableNode);
      if (typeof wasm.hwpx_edit_table_geometry !== "function") throw new Error("HwpxTableGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_geometry(section, tableNode)) throw memory.error();
        return decodeTableGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    automaticNumberSources(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_automatic_number_sources !== "function") throw new Error("HwpxAutomaticNumberSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_automatic_number_sources(section)) throw memory.error();
        return decodeAutomaticNumberSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    automaticNumberSites(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_automatic_number_sites !== "function") throw new Error("HwpxAutomaticNumberSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_automatic_number_sites(section)) throw memory.error();
        return decodeAutomaticNumberSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    noteReferenceSites(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_note_reference_sites !== "function") throw new Error("HwpxNoteReferenceSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_note_reference_sites(section)) throw memory.error();
        return decodeNoteReferenceSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    paragraphTextSnapshot(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_paragraph_text_snapshot !== "function") throw new Error("HwpxParagraphTextSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_text_snapshot(section)) throw memory.error();
        return decodeParagraphTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formulaFieldSources(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_formula_field_sources !== "function") throw new Error("HwpxFormulaFieldSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_field_sources(section)) throw memory.error();
        return decodeFormulaFieldSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableCaptionBindings(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_table_caption_bindings !== "function") throw new Error("HwpxTableCaptionBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_caption_bindings(section)) throw memory.error();
        return decodeTableCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableCaption(section, tableNode) {
      ready(); uint(section); uint(tableNode);
      if (typeof wasm.hwpx_edit_table_caption !== "function") throw new Error("HwpxTableCaptionAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_caption(section, tableNode)) throw memory.error();
        return decodeTableCaption(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    tableCellMargin(section, listNode) {
      ready(); uint(section); uint(listNode);
      if (typeof wasm.hwpx_edit_table_cell_margin !== "function") throw new Error("HwpxTableCellMarginAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_cell_margin(section, listNode)) throw memory.error();
        return decodeTableCellMargin(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formulaSources(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_formula_sources !== "function") throw new Error("HwpxFormulaSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_sources(section)) throw memory.error();
        return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formulaCurrent(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_formula_current !== "function") throw new Error("HwpxFormulaCurrentAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_current(section)) throw memory.error();
        return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), { current: true });
      } finally { wasm.hwpx_edit_output_free(); }
    },
    linePlacement(section, lineNode) {
      ready(); uint(section); uint(lineNode);
      if (typeof wasm.hwpx_edit_line_placement !== "function") throw new Error("HwpxLinePlacementAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_placement(section, lineNode)) throw memory.error();
        return decodeLinePlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    lineDisplay(section, lineNode) {
      ready(); uint(section); uint(lineNode);
      if (typeof wasm.hwpx_edit_line_display !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_display(section, lineNode)) throw memory.error();
        return decodeLineDisplay(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureBytes(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_bytes !== "function") throw new Error("HwpxPictureBytesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_bytes(section, pictureNode)) throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureGeometry(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_geometry !== "function") throw new Error("HwpxPictureGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_geometry(section, pictureNode)) throw memory.error();
        return decodePictureGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureSizeProtection(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_size_protection !== "function") throw new Error("HwpxPictureSizeProtectionAbiUnavailable");
      const value = wasm.hwpx_edit_picture_size_protection(section, pictureNode);
      if (value === 3) throw memory.error();
      if (![0, 1, 2].includes(value)) throw new Error("InvalidPictureSizeProtection");
      return value === 0 ? null : value === 2;
    },
    pictureCrop(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_crop !== "function") throw new Error("HwpxPictureCropAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_crop(section, pictureNode)) throw memory.error();
        return decodePictureCrop(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    pictureTransform(section, pictureNode) {
      ready(); uint(section); uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_transform !== "function") throw new Error("HwpxPictureTransformAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_transform(section, pictureNode)) throw memory.error();
        return decodePictureTransform(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    characterRanges(section, paragraph) {
      ready(); uint(section); uint(paragraph);
      if (typeof wasm.hwpx_edit_character_ranges !== "function") throw new Error("HwpxCharacterRangesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_ranges(section, paragraph)) throw memory.error();
        return decodeCharacterRanges(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    anchorText(section, paragraph) {
      ready(); uint(section); uint(paragraph);
      if (typeof wasm.hwpx_edit_anchor_text !== "function") throw new Error("HwpxAnchorEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_anchor_text(section, paragraph)) throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    spliceAnchored(section, paragraph, start, deleted, text) {
      ready(); [section, paragraph, start, deleted].forEach(uint);
      if (typeof wasm.hwpx_edit_splice_anchored !== "function") throw new Error("HwpxAnchorEditAbiUnavailable");
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice_anchored(section, paragraph, start, deleted, ptr, size)) throw memory.error();
      });
    },
    spliceFieldLabel(section, paragraph, beginElement, start, deleted, text) {
      ready();
      [section, paragraph, beginElement, start, deleted].forEach(uint);
      if (typeof wasm.hwpx_edit_splice_field_label !== "function") throw new Error("HwpxFieldEditAbiUnavailable");
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice_field_label(section, paragraph, beginElement, start, deleted, ptr, size)) throw memory.error();
      });
    },
    setFormulaDefinition(section, beginElement, formula) {
      ready(); [section, beginElement].forEach(uint);
      if (typeof wasm.hwpx_edit_set_formula_definition !== "function") throw new Error("HwpxFormulaEditAbiUnavailable");
      const bytes = encodedText(formula);
      if (bytes.length > 4096) throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_formula_definition(section, beginElement, ptr, size)) throw memory.error();
      });
    },
    formSourceNodes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_form_source_nodes !== "function") throw new Error("HwpxFormSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_nodes(section)) throw memory.error();
        return decodeFormSourceNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formSites(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_form_sites !== "function") throw new Error("HwpxFormSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_sites(section)) throw memory.error();
        return decodeFormSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formSourceAttributes(section, formNode) {
      ready(); [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_form_source_attributes !== "function") throw new Error("HwpxFormSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_attributes(section, formNode)) throw memory.error();
        return decodeFormSourceAttributes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    checkBoxState(section, formNode) {
      ready(); [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_checkbox_state !== "function") throw new Error("HwpxCheckBoxStateAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_checkbox_state(section, formNode)) throw memory.error();
        return new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    formSourceLayout(section, formNode) {
      ready(); [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_form_source_layout !== "function") throw new Error("HwpxFormLayoutAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_layout(section, formNode)) throw memory.error();
        return decodeFormSourceLayout(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    setCheckBoxState(section, formNode, state) {
      ready(); [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_set_checkbox_state !== "function") throw new Error("HwpxCheckBoxStateAbiUnavailable");
      const bytes = encodedText(state);
      if (bytes.length > 32) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_checkbox_state(section, formNode, ptr, size)) throw memory.error();
      });
    },
    fieldLabels(section, paragraph) {
      ready(); uint(section); uint(paragraph);
      if (typeof wasm.hwpx_edit_field_labels !== "function") throw new Error("HwpxFieldEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_field_labels(section, paragraph)) throw memory.error();
        const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
        if (bytes.length < 4) throw new Error("InvalidFieldTargets");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const count = view.getUint32(0, true);
        if (count > 4096 || bytes.length !== 4 + count * 12) throw new Error("InvalidFieldTargets");
        return Array.from({ length: count }, (_, index) => {
          const offset = 4 + index * 12;
          const target = { beginElement: view.getUint32(offset, true), start: view.getUint32(offset + 4, true), end: view.getUint32(offset + 8, true) };
          if (target.end < target.start) throw new Error("InvalidFieldTargets");
          return target;
        });
      } finally { wasm.hwpx_edit_output_free(); }
    },
    save() {
      ready();
      try {
        if (!wasm.hwpx_edit_save()) throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally { wasm.hwpx_edit_output_free(); }
    },
    close() { if (!closed) wasm.hwpx_edit_close(); closed = true; },
  };
}
import { paragraphMarginArgs } from "./paragraph-margin-args.mjs";
