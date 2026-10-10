import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { attachCheckBoxes } from "./checkbox-content.mjs";
import { createHwpxPasswordDecoder } from "../../js/hwpx-password.mjs";
import { createHwp5PasswordDecoder } from "../../js/hwp5-password.mjs";
import { requirePasswordRemovalConsent } from "./password-policy.mjs";
import { displayHwpxContent, HWPX_DISPLAY_BOUNDS } from "./hwpx-content.mjs";
import { projectHwpxWindow } from "./hwpx-window-projection.mjs";
import { attachHwpxStyles } from "./hwpx-style-content.mjs";
import { attachHwp5Styles } from "./hwp5-style-content.mjs";
import { attachHwp5Tables } from "./hwp5-table-content.mjs";
import { attachHwp5ParagraphFormats } from "./hwp5-paragraph-formats.mjs";
import { attachHwpxParagraphFormats } from "./hwpx-paragraph-formats.mjs";
import { attachHwpxFormulas } from "./hwpx-formulas-content.mjs";
import { attachHwpxTables } from "./hwpx-table-content.mjs";
import { attachDrawingTextBindings } from "./drawing-text-content.mjs";
import { attachAutomaticNumbers, retainedAutomaticNumberPlainText } from "./automatic-number-content.mjs";
import { attachNoteReferences } from "./note-reference-content.mjs";
import { attachHwpxPictures } from "./hwpx-picture-content.mjs";
import { attachHwpxLines } from "./hwpx-line-content.mjs";
import { attachHwpxConnectors } from "./hwpx-connector-content.mjs";
import { attachHwp5Lines } from "./hwp5-line-content.mjs";
import { attachHwpxPageSettings } from "./hwpx-page-content.mjs";
import { attachHwp5PageSources } from "./hwp5-page-content.mjs";
import { displayContent } from "./content.mjs";
import { projectHwp5RootContent } from "./hwp5-root-content-projection.mjs";
import { attachHwp5Pictures, readHwp5PictureBytes } from "./hwp5-picture-content.mjs";
import { attachHwp5PictureTails } from "./hwp5-picture-tail-content.mjs";
import { projectHwp5PictureGeometry } from "./hwp5-picture-geometry.mjs";
import { projectHwp5GroupGeometry } from "./hwp5-group-geometry-projection.mjs";
import { clipText } from "./content.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { saveDocument } from "./document-save.mjs";
import { encodeCharacterRanges } from "../../js/character-range-batch.mjs";
let module, bytes, preview, editor, format;
let historyEnabled = false;
let protectionRemoved = false;
let hwp5StyleOpenError = null;
let hwpxWindow = null;
function outsideFieldRange(section, paragraph, start, end) {
  return WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_can_edit_outside_field" && entry.kind === "function") && editor.canEditOutsideField(section, paragraph, start, end);
}
function hwp5Display() {
  // Only an explicitly opened native editor can lift the display-only gate.
  const content = displayContent(editor && historyEnabled && preview.primarySource === "distribution_viewtext" ? { ...preview, readOnly: false } : preview);
  if (preview.primarySource === "distribution_viewtext") content.primarySource = preview.primarySource;
  content.distributionEditingAvailable = preview.primarySource === "distribution_viewtext" && WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_open_distribution" && entry.kind === "function");
  content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_paragraph_alignment" && entry.kind === "function");
  content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_paragraph_margins" && entry.kind === "function");
  content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_paragraph_spacing" && entry.kind === "function");
  content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_properties" && entry.kind === "function");
  content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_properties_ranges" && entry.kind === "function");
  content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_replace_paragraph_ranges" && entry.kind === "function");
  content.characterUnderlineAvailable = ["hwp5_edit_set_character_underline", "hwp5_edit_character_underlines"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  content.characterStrikeAvailable = ["hwp5_edit_set_character_strike", "hwp5_edit_character_strikes"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  content.characterStrikeRangesAvailable = content.characterStrikeAvailable && WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_strike_ranges" && entry.kind === "function");
  content.characterUnderlineRangesAvailable = content.characterUnderlineAvailable && WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_underline_ranges" && entry.kind === "function");
  content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_underline_color" && entry.kind === "function");
  content.characterTextColorAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_text_color" && entry.kind === "function");
  content.characterShadeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_shade" && entry.kind === "function");
  content.characterEffectAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_effect" && entry.kind === "function");
  content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_effect_exclusive" && entry.kind === "function");
  content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_effect_ranges_exclusive" && entry.kind === "function");
  content.characterOutlineAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_outline" && entry.kind === "function");
  content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_outline_ranges" && entry.kind === "function");
  content.characterOutlineExtendedAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_outline_extended" && entry.kind === "function");
  content.characterOutlineRangesExtendedAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_outline_ranges_extended" && entry.kind === "function");
  content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_effect_ranges" && entry.kind === "function");
  content.characterFontAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_font" && entry.kind === "function");
  content.characterFontNameAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_font_name" && entry.kind === "function");
  content.namedFontTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_splice_font_name" && entry.kind === "function");
  content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_splice_character_properties" && entry.kind === "function");
  content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_splice_font_name_properties" && entry.kind === "function");
  content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_replace_paragraph_ranges_font_name" && entry.kind === "function");
  content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_replace_paragraph_ranges_properties" && entry.kind === "function");
  content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_replace_paragraph_ranges_font_name_properties" && entry.kind === "function");
  content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_font_name_ranges" && entry.kind === "function");
  content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_font_ranges" && entry.kind === "function");
  content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_text_color_ranges" && entry.kind === "function");
  content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_character_shade_ranges" && entry.kind === "function");
  if (protectionRemoved) content.passwordProtectionRemoved = true;
  const paragraphFormatAvailable = ["hwp5_edit_para_shape_count", "hwp5_edit_para_shape_id", "hwp5_edit_set_paragraph_format"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  const prepared = attachHwp5PictureTails(editor, attachHwp5Pictures(editor, attachHwp5PageSources(editor, attachHwp5ParagraphFormats(editor, attachHwp5Tables(editor, preview, attachHwp5Styles(editor, preview, content, hwp5StyleOpenError)), paragraphFormatAvailable))));
  prepared.hwp5GroupGeometry = projectHwp5GroupGeometry(prepared);
  attachHwp5Lines(editor, prepared);
  if (prepared.hwp5Pictures?.length) {
    const pictures = projectHwp5PictureGeometry(prepared);
    if (pictures.state === "projected") prepared.pictures = pictures.pictures;
    else prepared.hwp5PictureGeometryError = pictures.error;
  }
  const roots = projectHwp5RootContent(prepared);
  if (roots.state === "projected") return roots.content;
  if (prepared.hwp5Drawings?.length && prepared.hwp5Drawings.every(row => row.source.kind_id === 0x24636f6e)) prepared.hwp5GroupPageModelError = roots.error;
  else prepared.hwp5DrawingPageModelError = roots.error;
  return prepared;
}
function anchorView(section, paragraph) {
  try { return editor.anchorText(section, paragraph); }
  catch (error) {
    if (["MissingTextSite", "UnsupportedParagraphControl", "UnsupportedInlineControl", "SourceBindingMismatch", "UnsupportedTextPositionProjection", "HwpxAnchorEditAbiUnavailable", "UnsupportedStructuralAnchorEdit", "UnsupportedStructuralFieldEdit"].includes(error.message)) return null;
    throw error;
  }
}
function hwpxDisplay(projected) {
  if (!projected && hwpxWindow) {
    const offset = Math.min(hwpxWindow.offset, Math.max(0, preview.paragraphCount - 1));
    const count = Math.min(hwpxWindow.count, preview.paragraphCount - offset);
    projected = projectHwpxWindow(editor, preview, { offset, count });
  }
  const content = projected ?? displayHwpxContent(preview);
  if (!content.window) attachHwpxFormulas(editor, content);
  content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_paragraph_alignment" && entry.kind === "function");
  content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_paragraph_margins" && entry.kind === "function");
  content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_paragraph_spacing" && entry.kind === "function");
  content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_properties" && entry.kind === "function");
  content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_properties_ranges" && entry.kind === "function");
  content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_replace_paragraph_ranges" && entry.kind === "function");
  content.characterUnderlineAvailable = ["hwpx_edit_set_character_underline", "hwpx_edit_character_underlines"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  content.characterStrikeAvailable = ["hwpx_edit_set_character_strike", "hwpx_edit_character_strikes"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  content.characterStrikeRangesAvailable = content.characterStrikeAvailable && WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_strike_ranges" && entry.kind === "function");
  content.characterUnderlineRangesAvailable = content.characterUnderlineAvailable && WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_underline_ranges" && entry.kind === "function");
  content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_underline_color" && entry.kind === "function");
  content.characterTextColorAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_text_color" && entry.kind === "function");
  content.characterShadeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_shade" && entry.kind === "function");
  content.characterEffectAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_effect" && entry.kind === "function");
  content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_effect_exclusive" && entry.kind === "function");
  content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_effect_ranges_exclusive" && entry.kind === "function");
  content.characterOutlineAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_outline" && entry.kind === "function");
  content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_outline_ranges" && entry.kind === "function");
  content.characterOutlineExtendedAvailable = false;
  content.characterOutlineRangesExtendedAvailable = false;
  content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_effect_ranges" && entry.kind === "function");
  content.characterFontAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_font" && entry.kind === "function");
  content.characterFontNameAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_font_name" && entry.kind === "function");
  content.namedFontTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_splice_font_name" && entry.kind === "function");
  content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_splice_character_properties" && entry.kind === "function");
  content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_splice_font_name_properties" && entry.kind === "function");
  content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_replace_paragraph_ranges_font_name" && entry.kind === "function");
  content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_replace_paragraph_ranges_properties" && entry.kind === "function");
  content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_replace_paragraph_ranges_font_name_properties" && entry.kind === "function");
  content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_font_name_ranges" && entry.kind === "function");
  content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_font_ranges" && entry.kind === "function");
  content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_text_color_ranges" && entry.kind === "function");
  content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_character_shade_ranges" && entry.kind === "function");
  let units = 0;
  const currentText = new Map();
  const nextMerge = new Map(), previousMerge = new Map();
  const neighborAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_paragraph_neighbors" && entry.kind === "function");
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    for (const row of editor.paragraphTextSnapshot(section)) currentText.set(`${section}:${row.paragraph - 1}`, row);
    if (neighborAvailable) {
      const neighbors = editor.paragraphNeighbors(section);
      for (const [index, value] of neighbors.next.entries()) {
        const paragraph = neighbors.firstParagraph + index - 1;
        nextMerge.set(`${section}:${paragraph}`, value === null ? null : value - 1);
        if (value !== null) {
          const key = `${section}:${value - 1}`;
          if (previousMerge.has(key)) throw new Error("DuplicateParagraphNeighbor");
          previousMerge.set(key, paragraph);
        }
      }
    }
  }
  for (const paragraph of content.paragraphs) {
    const current = currentText.get(`${paragraph.section}:${paragraph.paragraph}`);
    if (!current) throw new Error("MissingCurrentParagraphText");
    paragraph.selectionOwner = current.nested ? null : `section:${paragraph.section}:body`;
    if (neighborAvailable) {
      paragraph.nextMergeParagraph = nextMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
      paragraph.previousMergeParagraph = previousMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
    }
    paragraph.label = `구역 ${paragraph.section + 1} · 문단 ${paragraph.paragraph + 1}${current.nested ? " · 중첩" : ""} · HWPX 읽기 전용`;
    paragraph.plainEditable = !paragraph.clipped && editor.canEdit(paragraph.section, paragraph.paragraph + 1);
    if (paragraph.plainEditable) {
      const anchored = editor.anchorText(paragraph.section, paragraph.paragraph + 1);
      paragraph.text = current.nested ? retainedAutomaticNumberPlainText(editor, paragraph.section, paragraph.paragraph + 1, current.text, anchored) : anchored;
    }
    paragraph.fieldLabels = [];
    paragraph.anchorEditable = false;
    if (!paragraph.clipped && !paragraph.plainEditable) {
      const anchored = anchorView(paragraph.section, paragraph.paragraph + 1);
      if (anchored !== null) {
        paragraph.text = anchored;
        paragraph.anchorEditable = true;
      }
    }
    const clipped = clipText(paragraph.text, Math.max(0, HWPX_DISPLAY_BOUNDS.maxUnits - units));
    if (clipped !== paragraph.text) { paragraph.clipped = true; content.limited = true; paragraph.text = clipped; }
    units += paragraph.text.length;
    if (paragraph.clipped) { paragraph.plainEditable = false; paragraph.anchorEditable = false; }
    paragraph.anchoredSplitAvailable = !paragraph.clipped && (paragraph.anchorEditable || paragraph.plainEditable && paragraph.text.includes("\t")) && WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_split_anchored" && entry.kind === "function");
    if (!paragraph.clipped && !paragraph.plainEditable && !paragraph.anchorEditable) {
      try {
        paragraph.fieldLabels = editor.fieldLabels(paragraph.section, paragraph.paragraph + 1);
      } catch (error) {
        if (!["InvalidFieldLinks", "SourceBindingMismatch", "UnsupportedTextPositionProjection", "HwpxFieldEditAbiUnavailable", "UnsupportedStructuralFieldEdit"].includes(error.message)) throw error;
        paragraph.fieldReadOnlyReason = error.message;
      }
    }
    paragraph.editable = paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0;
    if (paragraph.editable) paragraph.label = paragraph.label.replace("읽기 전용", paragraph.plainEditable ? "일반 텍스트 편집" : paragraph.anchorEditable ? "보호 개체 텍스트 편집" : "필드 라벨만 편집");
  }
  content.readOnly = !content.paragraphs.some(paragraph => paragraph.editable);
  attachAutomaticNumbers(editor, content);
  attachNoteReferences(editor, content);
  attachDrawingTextBindings(editor, content);
  attachCheckBoxes(editor, content, ["hwpx_edit_form_sites", "hwpx_edit_form_source_attributes", "hwpx_edit_checkbox_state", "hwpx_edit_set_checkbox_state"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function")));
  if (protectionRemoved) content.passwordProtectionRemoved = true;
  const styleAvailable = ["hwpx_edit_character_shapes", "hwpx_edit_character_ranges"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  const paragraphAvailable = ["hwpx_edit_paragraph_shape_ids", "hwpx_edit_paragraph_shape_refs", "hwpx_edit_set_paragraph_format"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
  const tableContent = attachHwpxTables(editor, attachHwpxStyles(editor, content, styleAvailable));
  if (content.window) attachHwpxFormulas(editor, tableContent);
  const displayed = attachHwpxPageSettings(editor, attachHwpxConnectors(editor, attachHwpxLines(editor, attachHwpxPictures(editor, attachHwpxParagraphFormats(editor, tableContent, paragraphAvailable)))));
  displayed.lines.push(...displayed.connectors.flatMap(row => row.referenceLine ? [row.referenceLine] : []));
  if (content.window && content.paragraphs.some(row => row.clipped)) throw new Error("ParagraphWindowTextBudgetExceeded");
  return displayed;
}
self.onmessage = async event => {
  let reader;
  const message = event.data;
  const reply = value => {
    let historyRevision;
    let historyRevisions;
    if (historyEnabled && editor && WebAssembly.Module.exports(module).some(entry => entry.name === `${format}_edit_history_revision`)) historyRevision = editor.historyRevision();
    if (historyEnabled && editor && ["count", "at"].every(suffix => WebAssembly.Module.exports(module).some(entry => entry.name === `${format}_edit_history_revision_${suffix}`))) historyRevisions = editor.historyRevisions();
    self.postMessage({ origin: message.origin, ...value, ...(historyRevision === undefined ? {} : { historyRevision }), ...(historyRevisions === undefined ? {} : { historyRevisions }) });
  };
  let applied = false;
  try {
    if (message.kind === "set-edit-window") {
      if (!editor || !preview || !historyEnabled) throw new Error("EditorNotOpen");
      if (format !== "hwpx") throw new Error("UnsupportedDocumentWindowFormat");
      const full = message.offset === null && message.count === null;
      const projected = full ? displayHwpxContent(preview) : projectHwpxWindow(editor, preview, { offset: message.offset, count: message.count });
      const content = hwpxDisplay(projected);
      hwpxWindow = full ? null : { offset: message.offset, count: message.count };
      reply({ kind: "set-edit-window", content });
      return;
    }
    if (message.kind === "query-window" || message.kind === "query-edit-window") {
      if (!editor || !preview) throw new Error("EditorNotOpen");
      if (format !== "hwpx") throw new Error("UnsupportedDocumentWindowFormat");
      if (message.kind === "query-edit-window" && !historyEnabled) throw new Error("EditorNotOpen");
      let content = projectHwpxWindow(editor, preview, { offset: message.offset, count: message.count });
      if (message.kind === "query-edit-window") {
        content = hwpxDisplay(content);
        if (content.paragraphs.some(row => row.clipped)) throw new Error("ParagraphWindowTextBudgetExceeded");
      }
      reply({ kind: message.kind, content });
      return;
    }
    if (message.kind === "query-edit-range") {
      reply(selectionEditQuery(message, { active: Boolean(editor) && historyEnabled, format, canEdit: outsideFieldRange }));
      return;
    }
    if (message.kind === "query-split-range") {
      reply(selectionSplitQuery(message, { active: Boolean(editor) && historyEnabled, format, canSplit: (section, paragraph, atUnit, endUnit) => editor.canSplitParagraph({ section, paragraph, atUnit, endUnit }) }));
      return;
    }
    // Opening a native session for display metadata does not activate editing.
    if (format === "hwp5" && !historyEnabled && ["save", "undo", "redo", "split", "merge", "splice", "format"].includes(message.kind)) throw new Error("EditorNotOpen");
    if (message.kind === "load") {
      editor?.close(); editor = undefined; preview = undefined;
      if (protectionRemoved) bytes?.fill(0);
      protectionRemoved = false;
      bytes = undefined; module = undefined;
      historyEnabled = false;
      hwp5StyleOpenError = null;
      hwpxWindow = null;
      format = message.format ?? "hwp5";
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnknownDocumentFormat");
      const response = await fetch("../../zig-out/bin/hwpjs.wasm", { cache: "no-cache" });
      if (!response.ok) throw new Error(`WASM HTTP ${response.status}: 먼저 Zig 빌드를 실행하세요.`);
      module = await WebAssembly.compile(await response.arrayBuffer());
      bytes = new Uint8Array(message.bytes);
      if (format === "hwpx") {
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(bytes);
        const next = await createHwpxEditor(module);
        try { next.open(bytes); } catch (error) { next.close(); throw error; }
        editor = next;
        reply({ kind: "load", content: hwpxDisplay() });
        return;
      }
      reader = await createHwp5Reader(module);
      preview = reader.readText(bytes);
      if (!preview.readOnly) {
        try { editor = await createExperimentalHwp5Editor(module, bytes); }
        catch (error) { hwp5StyleOpenError = error.message; }
      }
      reply({ kind: "load", content: hwp5Display() });
    } else if (message.kind === "picture-bytes") {
      if (!editor || !["hwpx", "hwp5"].includes(format)) throw new Error("PictureReadUnavailable");
      const pictureBytes = format === "hwp5" ? readHwp5PictureBytes(editor, message.section, message.pictureNode) : editor.pictureBytes(message.section, message.pictureNode);
      reply({ kind: "picture-bytes", section: message.section, pictureNode: message.pictureNode, bytes: pictureBytes });
    } else if (message.kind === "unlock") {
      if (!bytes || !module) throw new Error("PasswordDocumentNotLoaded");
      const decoder = await (format === "hwpx" ? createHwpxPasswordDecoder(module) : createHwp5PasswordDecoder(module));
      let plaintext;
      try { plaintext = decoder.decryptToPlaintext(bytes, message.password); }
      finally { decoder.close(); delete message.password; }
      if (!plaintext) throw new Error("DocumentNotEncrypted");
      let next;
      try {
        reader = await (format === "hwpx" ? createHwpxReader(module) : createHwp5Reader(module));
        const current = format === "hwpx" ? reader.readTextEvents(plaintext) : reader.readText(plaintext);
        if (format === "hwpx") {
          next = await createHwpxEditor(module);
          next.open(plaintext);
        } else next = await createExperimentalHwp5Editor(module, plaintext);
        editor?.close(); editor = next; next = undefined;
        bytes = plaintext; preview = current; protectionRemoved = true;
        historyEnabled = false;
        reply({ kind: "unlock", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
      } catch (error) {
        next?.close();
        if (bytes !== plaintext) plaintext.fill(0);
        throw error;
      }
    } else if (message.kind === "save") {
      requirePasswordRemovalConsent(protectionRemoved, message.allowUnprotectedOutput);
      const saved = saveDocument(editor, format, message.allowStaleLayout === undefined ? false : message.allowStaleLayout);
      reply({ kind: "save", ...saved, ...(protectionRemoved ? { passwordProtectionRemoved: true } : {}) });
    } else if (message.kind === "splice-font-name" || message.kind === "splice-character-properties") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error(message.kind === "splice-font-name" ? "UnsupportedNamedFontTextEditing" : "UnsupportedCharacterPropertyTextEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (message.rangePolicy !== undefined && message.rangePolicy !== "reject") throw new Error("InvalidRangePolicy");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      const paragraph = message.paragraph + (format === "hwpx" ? 1 : 0);
      let textMode = "plain", beginElement = 0;
      if (format === "hwpx" && !editor.canEdit(message.section, paragraph)) {
        if (outsideFieldRange(message.section, paragraph, message.startUnit, message.endUnit)) textMode = "plain";
        else if (anchorView(message.section, paragraph) !== null) textMode = "anchored";
        else {
          const matches = editor.fieldLabels(message.section, paragraph).filter(target => message.startUnit >= target.start && message.endUnit <= target.end);
          if (matches.length !== 1) throw new Error("UnsupportedFieldLabelRange");
          textMode = "field"; beginElement = matches[0].beginElement;
        }
      }
      if (message.kind === "splice-font-name") editor.spliceWithFontName({ ...message, paragraph, textMode, beginElement });
      else editor.spliceWithCharacterProperties({ ...message, paragraph, textMode, beginElement });
      applied = true;
      if (format === "hwpx") {
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.save());
      } else {
        reader = await createHwp5Reader(module);
        preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
      }
      reply({ kind: message.kind, content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-font-name") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterFontNameEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      editor.setCharacterFontName({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, language: message.language, name: message.name });
      applied = true;
      reply({ kind: "character-font-name", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-font") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterFontEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      editor.setCharacterFont({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, language: message.language, fontId: message.fontId });
      applied = true;
      reply({ kind: "character-font", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-outline") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterOutlineEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      editor.setCharacterOutline({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, kind: message.outlineKind });
      applied = true;
      reply({ kind: "character-outline", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-effect") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterEffectEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      editor.setCharacterEffect({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, effect: message.effect, enabled: message.enabled, exclusive: message.exclusive });
      applied = true;
      reply({ kind: "character-effect", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-shade") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterShadeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("Invalid paragraph");
      editor.setCharacterShade({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, color: message.color });
      applied = true;
      reply({ kind: "character-shade", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-text-color") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterTextColorEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCharacterTextColor({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, color: message.color });
      applied = true;
      reply({ kind: "character-text-color", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-underline-color") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterUnderlineColorEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCharacterUnderlineColor({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, color: message.color });
      applied = true;
      reply({ kind: "character-underline-color", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-strike") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterStrikeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 0xfffffffe : 0xffffffff)) throw new RangeError("InvalidTextPosition");
      editor.setCharacterStrike({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, enabled: message.enabled });
      applied = true;
      reply({ kind: "character-strike", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-underline") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterUnderlineEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCharacterUnderline({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, kind: message.underlineKind });
      applied = true;
      reply({ kind: "character-underline", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "replace-paragraph-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedParagraphReplacement");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      if (Object.hasOwn(message, "language") || Object.hasOwn(message, "name")) {
        editor.replaceParagraphRangesWithFontName({ ranges, text: message.text, language: message.language, name: message.name, properties: message.properties });
      } else editor.replaceParagraphRanges({ ranges, text: message.text, properties: message.properties });
      applied = true;
      if (format === "hwpx") {
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.save());
      } else {
        reader = await createHwp5Reader(module);
        preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
      }
      reply({ kind: "replace-paragraph-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-font-name-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterFontNameEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("Invalid paragraph");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterFontNameRanges({ ranges, language: message.language, name: message.name });
      applied = true;
      reply({ kind: message.kind, content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-font-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterFontEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterFontRanges({ ranges, language: message.language, fontId: message.fontId });
      applied = true;
      reply({ kind: "character-font-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-outline-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterOutlineEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("InvalidTextPosition");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterOutlineRanges({ ranges, kind: message.outlineKind });
      applied = true;
      reply({ kind: "character-outline-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-effect-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterEffectEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("InvalidTextPosition");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterEffectRanges({ ranges, effect: message.effect, enabled: message.enabled, exclusive: message.exclusive });
      applied = true;
      reply({ kind: "character-effect-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-shade-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterShadeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("InvalidTextPosition");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterShadeRanges({ ranges, color: message.color });
      applied = true;
      reply({ kind: "character-shade-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-text-color-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterTextColorEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterTextColorRanges({ ranges, color: message.color });
      applied = true;
      reply({ kind: "character-text-color-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-strike-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterStrikeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("InvalidTextPosition");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterStrikeRanges({ ranges, enabled: message.enabled });
      applied = true;
      reply({ kind: "character-strike-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-underline-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterUnderlineEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      encodeCharacterRanges(message.ranges);
      if (format === "hwpx" && message.ranges.some(range => range.paragraph === 0xffffffff)) throw new RangeError("Invalid paragraph");
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterUnderlineRanges({ ranges, kind: message.underlineKind });
      applied = true;
      reply({ kind: "character-underline-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-properties-ranges") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterPropertiesEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      // 번호 변환 전에 검증하여 문자열 연결·누락 값의 보정을 막습니다.
      encodeCharacterRanges(message.ranges);
      const ranges = message.ranges.map(range => ({ ...range, paragraph: range.paragraph + (format === "hwpx" ? 1 : 0) }));
      editor.setCharacterPropertiesRanges({ ranges, properties: message.properties });
      applied = true;
      reply({ kind: "character-properties-ranges", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "character-properties") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedCharacterPropertiesEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCharacterProperties({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), startUnit: message.startUnit, endUnit: message.endUnit, properties: message.properties });
      applied = true;
      reply({ kind: "character-properties", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "paragraph-spacing") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedParagraphSpacingEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setParagraphSpacing({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), type: message.type, value: message.value });
      applied = true;
      reply({ kind: "paragraph-spacing", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "paragraph-margins") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedParagraphMarginsEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setParagraphMargins({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), margins: message.margins });
      applied = true;
      reply({ kind: "paragraph-margins", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "paragraph-alignment") {
      if (format !== "hwpx" && format !== "hwp5") throw new Error("UnsupportedParagraphAlignmentEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setParagraphAlignment({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), alignment: message.alignment });
      applied = true;
      reply({ kind: "paragraph-alignment", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "paragraph-format") {
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnsupportedParagraphFormatEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setParagraphFormat({ section: message.section, paragraph: message.paragraph + (format === "hwpx" ? 1 : 0), paraShapeId: message.paraShapeId });
      applied = true;
      reply({ kind: "paragraph-format", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "formula-definition") {
      if (format !== "hwpx") throw new Error("UnsupportedFormulaDefinitionEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setFormulaDefinition(message.section, message.beginElement, message.formula);
      applied = true;
      reader = await createHwpxReader(module);
      preview = reader.readTextEvents(editor.save());
      reply({ kind: "formula-definition", content: hwpxDisplay() });
    } else if (message.kind === "checkbox-state") {
      if (format !== "hwpx") throw new Error("UnsupportedCheckBoxStateEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCheckBoxState(message.section, message.formNode, message.state);
      applied = true;
      reply({ kind: "checkbox-state", content: hwpxDisplay() });
    } else if (message.kind === "picture-resize") {
      if (format !== "hwpx" && format !== "hwp5") throw new Error("UnsupportedPictureResizeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.resizePicture({ section: message.section, pictureNode: message.pictureNode, width: message.width, height: message.height });
      applied = true;
      reply({ kind: "picture-resize", content: format === "hwp5" ? hwp5Display() : hwpxDisplay() });
    } else if (message.kind === "picture-current-size") {
      if (format !== "hwp5") throw new Error("UnsupportedPictureCurrentSizeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setPictureCurrentSize({ section: message.section, pictureNode: message.pictureNode, width: message.width, height: message.height });
      applied = true;
      reply({ kind: "picture-current-size", content: hwp5Display() });
    } else if (message.kind === "picture-dimensions") {
      if (format !== "hwpx") throw new Error("UnsupportedPictureDimensionEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setPictureDimensions({ section: message.section, pictureNode: message.pictureNode, display: message.display, original: message.original, current: message.current });
      applied = true;
      reply({ kind: "picture-dimensions", content: hwpxDisplay() });
    } else if (message.kind === "cell-size") {
      if (format !== "hwpx" && format !== "hwp5") throw new Error("UnsupportedCellSizeEditing");
      if (!editor || !historyEnabled) throw new Error("EditorNotOpen");
      editor.setCellSize({ section: message.section, listNode: message.listNode, width: message.width, height: message.height });
      applied = true;
      reply({ kind: "cell-size", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
    } else if (message.kind === "enable") {
      if (format === "hwpx") {
        if (!editor) {
          const next = await createHwpxEditor(module);
          try { next.open(bytes); } catch (error) { next.close(); throw error; }
          editor = next;
        }
        if (!historyEnabled) { editor.enableHistory(); historyEnabled = true; }
        const structureAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_split" && entry.kind === "function");
        const splitQueryAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_can_split" && entry.kind === "function");
        const mergeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_merge" && entry.kind === "function");
        const formattingAvailable = ["hwpx_edit_set_character_format", "hwpx_edit_character_shape_ids"].every(name => WebAssembly.Module.exports(module).some(entry => entry.name === name && entry.kind === "function"));
        const charShapeIds = formattingAvailable ? editor.characterShapeIds() : [];
        const displayAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_character_shapes" && entry.kind === "function");
        let characterShapes = null, characterShapesError = null;
        if (displayAvailable) {
          try { characterShapes = editor.characterShapes(); }
          catch (error) { characterShapesError = error.message; }
        }
        // Optional display metadata must not disable otherwise valid editing.
        const cellSizeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_cell_size" && entry.kind === "function");
        const pictureDimensionsAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_set_picture_dimensions" && entry.kind === "function");
        const pictureResizeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwpx_edit_resize_picture" && entry.kind === "function");
        reply({ kind: "enable", charShapeCount: charShapeIds.length, charShapeIds, characterShapes, characterShapesError, historyAvailable: true, structureAvailable, splitQueryAvailable, mergeAvailable, cellSizeAvailable, pictureDimensionsAvailable, pictureResizeAvailable, content: hwpxDisplay() });
        return;
      }
      if (message.distribution !== undefined && typeof message.distribution !== "boolean") throw new Error("InvalidDistributionPolicy");
      editor ??= await createExperimentalHwp5Editor(module, bytes, { distribution: message.distribution ?? false });
      if (!historyEnabled) { editor.enableHistory(); historyEnabled = true; }
      const structureAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_split" && entry.kind === "function");
      const mergeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_merge" && entry.kind === "function");
      let characterShapes = null, characterShapesError = null;
      try { characterShapes = editor.characterShapes(); }
      catch (error) { characterShapesError = error.message; }
      const cellSizeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_cell_size" && entry.kind === "function");
      const pictureCurrentSizeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_set_picture_current_size" && entry.kind === "function");
      const pictureResizeAvailable = WebAssembly.Module.exports(module).some(entry => entry.name === "hwp5_edit_resize_picture" && entry.kind === "function");
      reply({ kind: "enable", charShapeCount: editor.characterShapeCount(), characterShapes, characterShapesError, historyAvailable: true, structureAvailable, mergeAvailable, cellSizeAvailable, pictureCurrentSizeAvailable, pictureResizeAvailable, content: hwp5Display() });
    } else if (message.kind === "undo" || message.kind === "redo") {
      if (!editor) throw new Error("EditorNotOpen");
      const changed = message.kind === "undo" ? editor.undo() : editor.redo();
      applied = changed;
      if (format === "hwpx") {
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.save());
        reply({ kind: message.kind, changed, content: hwpxDisplay() });
      } else {
        // Restore every derived paragraph/control/formula from native state.
        // Neither the original load bytes nor a JS inverse edit is authoritative.
        reader = await createHwp5Reader(module);
        preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
        reply({ kind: message.kind, changed, content: hwp5Display() });
      }
    } else if (message.kind === "split" || message.kind === "merge") {
      if (!editor) throw new Error("EditorNotOpen");
      if (format === "hwpx") {
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph >= 0xffffffff) throw new Error("InvalidParagraphIndex");
        const target = { ...message, paragraph: message.paragraph + 1 };
        if (message.kind === "split") {
          if (message.anchored !== undefined && typeof message.anchored !== "boolean") throw new Error("InvalidAnchorMode");
          if (message.anchored === true) editor.splitParagraphAnchored(target);
          else editor.splitParagraph(target);
        }
        else if (message.rightParagraph !== undefined) {
          if (!Number.isInteger(message.rightParagraph) || message.rightParagraph < 0 || message.rightParagraph >= 0xffffffff) throw new Error("InvalidParagraphIndex");
          editor.mergeParagraphPair({ ...target, rightParagraph: message.rightParagraph + 1 });
        } else editor.mergeParagraph(target);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.save());
        const content = hwpxDisplay();
        const splitParagraph = message.kind === "split" ? content.paragraphs.find(row => row.section === message.section && row.paragraph === message.paragraph)?.nextMergeParagraph : undefined;
        reply({ kind: message.kind, content, ...(message.kind === "split" ? { splitTarget: Number.isInteger(splitParagraph) ? { section: message.section, paragraph: splitParagraph } : null } : {}) });
        return;
      }
      if (message.kind === "merge" && message.rightParagraph !== undefined) throw new Error("UnsupportedMergeTarget");
      if (message.kind === "split") editor.splitParagraph(message);
      else editor.mergeParagraph(message);
      applied = true;
      reader = await createHwp5Reader(module);
      preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
      const content = hwp5Display();
      // HWP5 native split inserts one right paragraph in its flat section list.
      const right = message.kind === "split" ? content.paragraphs.find(row => row.section === message.section && row.paragraph === message.paragraph + 1 && row.editable) : null;
      reply({ kind: message.kind, content, ...(message.kind === "split" ? { splitTarget: right ? { section: right.section, paragraph: right.paragraph } : null } : {}) });
    } else if (message.kind === "splice" || message.kind === "format") {
      if (!editor) throw new Error("EditorNotOpen");
      if (format === "hwpx") {
        if (message.rangePolicy && message.rangePolicy !== "reject") throw new Error("InvalidRangePolicy");
        if (!Number.isInteger(message.startUnit) || !Number.isInteger(message.endUnit) || message.endUnit < message.startUnit) throw new Error("InvalidTextPosition");
        if (message.kind === "format") {
          editor.setCharacterFormat({ ...message, paragraph: message.paragraph + 1 });
        } else if (editor.canEdit(message.section, message.paragraph + 1)) {
          editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
        } else if (outsideFieldRange(message.section, message.paragraph + 1, message.startUnit, message.endUnit)) {
          editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
        } else if (anchorView(message.section, message.paragraph + 1) !== null) {
          editor.spliceAnchored(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
        } else {
          const targets = editor.fieldLabels(message.section, message.paragraph + 1);
          if (targets.length === 0) {
            // Preserve the native refusal classification for ordinary paths.
            editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
          } else {
            const matches = targets.filter(target => message.startUnit >= target.start && message.endUnit <= target.end);
            if (matches.length !== 1) throw new Error("UnsupportedFieldLabelRange");
            editor.spliceFieldLabel(message.section, message.paragraph + 1, matches[0].beginElement, message.startUnit, message.endUnit - message.startUnit, message.text);
          }
        }
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.save());
        reply({ kind: message.kind, content: hwpxDisplay() });
        return;
      }
      if (message.kind === "splice") editor.splice(message);
      else editor.setCharacterFormat(message);
      applied = true;
      // Refresh only a derived display snapshot from authoritative native text.
      // This snapshot is never used as an editor command's source or for saving.
      const raw = editor.copyText(message.section, message.paragraph);
      const p = preview.sections[message.section].paragraphs[message.paragraph];
      const sectionHasFields = preview.sections[message.section].paragraphs.some(paragraph => paragraph.tokens.some(t => t.type === "control" && t.code === 3));
      if (sectionHasFields || p.tokens.some(t => t.type === "control" && t.code !== 13)) {
        // Never interpret retained control payload as ordinary Unicode or
        // advertise it as directly editable. Reuse native token projection.
        reader = await createHwp5Reader(module);
        preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
      } else {
        const text = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(raw.subarray(0, -2));
        preview.sections[message.section].paragraphs[message.paragraph] = raw.length === 0 ? p : { ...p, text, textPresent: true, declaredUnits: raw.length / 2, tokens: [
          { type: "text", startUnit: 0, text, raw: raw.subarray(0, -2) },
          { type: "control", startUnit: raw.length / 2 - 1, code: 13, raw: raw.subarray(-2) },
        ] };
      }
      reply({ kind: message.kind, content: hwp5Display() });
    } else throw new Error("UnknownPreviewCommand");
  } catch (error) {
    delete message.password;
    const passwordRequired = message.kind === "load" && ((format === "hwpx" && error.message === "EncryptedDocument") || (format === "hwp5" && error.message === "UnsupportedEncryption"));
    const queryIdentity = ["query-edit-range", "query-split-range"].includes(message.kind) ? { requestId: message.requestId, section: message.section, paragraph: message.paragraph, startUnit: message.startUnit, endUnit: message.endUnit } : {};
    reply({ kind: message.kind, applied, error: error.message || String(error), ...queryIdentity, ...(passwordRequired ? { passwordRequired: true } : {}) });
  }
  finally { reader?.close(); }
};
import { selectionEditQuery, selectionSplitQuery } from "./selection-edit-query.mjs";
