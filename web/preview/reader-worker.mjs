import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { displayHwpxContent } from "./hwpx-content.mjs";
import { displayContent } from "./content.mjs";
import { clipText } from "./content.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { saveDocument } from "./document-save.mjs";
let module, bytes, preview, editor, format;
let historyEnabled = false;
function anchorView(section, paragraph) {
  try { return editor.anchorText(section, paragraph); }
  catch (error) {
    if (["MissingTextSite", "UnsupportedParagraphControl", "UnsupportedInlineControl", "SourceBindingMismatch", "UnsupportedTextPositionProjection", "HwpxAnchorEditAbiUnavailable"].includes(error.message)) return null;
    throw error;
  }
}
function hwpxDisplay() {
  const content = displayHwpxContent(preview);
  let units = 0;
  for (const paragraph of content.paragraphs) {
    paragraph.plainEditable = !paragraph.clipped && editor.canEdit(paragraph.section, paragraph.paragraph + 1);
    paragraph.fieldLabels = [];
    paragraph.anchorEditable = false;
    if (!paragraph.clipped && !paragraph.plainEditable) {
      const anchored = anchorView(paragraph.section, paragraph.paragraph + 1);
      if (anchored !== null) {
        paragraph.text = anchored;
        paragraph.anchorEditable = true;
      }
    }
    const clipped = clipText(paragraph.text, Math.max(0, 200000 - units));
    if (clipped !== paragraph.text) { paragraph.clipped = true; content.limited = true; paragraph.text = clipped; }
    units += paragraph.text.length;
    if (paragraph.clipped) { paragraph.plainEditable = false; paragraph.anchorEditable = false; }
    if (!paragraph.clipped && !paragraph.plainEditable && !paragraph.anchorEditable) {
      try {
        paragraph.fieldLabels = editor.fieldLabels(paragraph.section, paragraph.paragraph + 1);
      } catch (error) {
        if (!["InvalidFieldLinks", "SourceBindingMismatch", "UnsupportedTextPositionProjection", "HwpxFieldEditAbiUnavailable"].includes(error.message)) throw error;
        paragraph.fieldReadOnlyReason = error.message;
      }
    }
    paragraph.editable = paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0;
    if (paragraph.editable) paragraph.label = paragraph.label.replace("읽기 전용", paragraph.plainEditable ? "일반 텍스트 편집" : paragraph.anchorEditable ? "보호 개체 텍스트 편집" : "필드 라벨만 편집");
  }
  content.readOnly = !content.paragraphs.some(paragraph => paragraph.editable);
  return content;
}
self.onmessage = async event => {
  let reader;
  const message = event.data;
  const reply = value => self.postMessage({ origin: message.origin, ...value });
  let applied = false;
  try {
    if (message.kind === "load") {
      editor?.close(); editor = undefined; preview = undefined;
      historyEnabled = false;
      format = message.format ?? "hwp5";
      if (format !== "hwp5" && format !== "hwpx") throw new Error("UnknownDocumentFormat");
      const response = await fetch("../../zig-out/bin/hwpjs.wasm");
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
      reply({ kind: "load", content: displayContent(preview) });
    } else if (message.kind === "save") {
      const saved = saveDocument(editor, format, message.allowStaleLayout === undefined ? false : message.allowStaleLayout);
      reply({ kind: "save", ...saved });
    } else if (message.kind === "enable") {
      if (format === "hwpx") {
        if (!editor) {
          const next = await createHwpxEditor(module);
          try { next.open(bytes); } catch (error) { next.close(); throw error; }
          editor = next;
        }
        if (!historyEnabled) { editor.enableHistory(); historyEnabled = true; }
        reply({ kind: "enable", charShapeCount: 0, historyAvailable: true });
        return;
      }
      editor ??= await createExperimentalHwp5Editor(module, bytes);
      reply({ kind: "enable", charShapeCount: editor.characterShapeCount() });
    } else if (message.kind === "undo" || message.kind === "redo") {
      if (!editor) throw new Error("EditorNotOpen");
      if (format !== "hwpx") throw new Error("UnsupportedHistory");
      const changed = message.kind === "undo" ? editor.undo() : editor.redo();
      applied = changed;
      reader = await createHwpxReader(module);
      preview = reader.readTextEvents(editor.save());
      reply({ kind: message.kind, changed, content: hwpxDisplay() });
    } else if (message.kind === "splice" || message.kind === "format") {
      if (!editor) throw new Error("EditorNotOpen");
      if (format === "hwpx") {
        if (message.kind !== "splice") throw new Error("UnsupportedHwpxFormatting");
        if (message.rangePolicy && message.rangePolicy !== "reject") throw new Error("InvalidRangePolicy");
        if (!Number.isInteger(message.startUnit) || !Number.isInteger(message.endUnit) || message.endUnit < message.startUnit) throw new Error("InvalidTextPosition");
        if (editor.canEdit(message.section, message.paragraph + 1)) {
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
      reply({ kind: message.kind, content: displayContent(preview) });
    } else throw new Error("UnknownPreviewCommand");
  } catch (error) { reply({ kind: message.kind, applied, error: error.message || String(error) }); }
  finally { reader?.close(); }
};
