import { selectNoteSourceTables } from "./note-source-table-owners.mjs";
import { selectDrawingNoteReferenceOwners } from "./drawing-note-reference-owners.mjs";
export function bindSourceNoteBodies(content, sourceTables, maxNotes = 10000, options = {}) {
  if (!sourceTables) return bindNoteBodies(content, maxNotes, options);
  if (sourceTables.state !== "selected" || !(sourceTables.noteCellParagraphs instanceof Set)
    || !Array.isArray(sourceTables.bodyTables)) return { state: "unavailable", error: "InvalidNoteBodyBindings" };
  const cells = sourceTables.noteCellParagraphs;
  const direct = cells.size ? { ...content, paragraphs: content.paragraphs.filter(p => !cells.has(p.paragraph)),
    paragraphFlows: content.paragraphFlows.filter(p => !cells.has(p.paragraph)) } : content;
  return bindNoteBodies(direct, maxNotes, { ...options, bodyCellTables: sourceTables.bodyTables });
}
// Current references and direct note lists; page reservation remains separate.
export function bindNoteBodies(content, maxNotes = 10000, { bodyCellTables = [], allowDrawingReferences = false } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.paragraphFlows)
    || !Number.isSafeInteger(maxNotes) || maxNotes < 1 || content.limited
    || content.noteReferenceErrors?.length || content.paragraphFlowErrors?.length) return unavailable("InvalidNoteBodyBindings");
  const paragraphs = new Map(), flows = new Map(), notes = new Map(), references = new Map();
  const key = (section, node) => `${section}:${node}`;
  const uint = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(bodyCellTables)) return unavailable("InvalidNoteBodyBindings");
  const cellReferences = new Set();
  if (typeof allowDrawingReferences !== "boolean") return unavailable("InvalidNoteBodyBindings");
  const drawingReferences = allowDrawingReferences ? selectDrawingNoteReferenceOwners(content) : null;
  if (drawingReferences && drawingReferences.state !== "selected") return drawingReferences;
  if (bodyCellTables.length) {
    const selected = selectNoteSourceTables({ ...content, tables: bodyCellTables });
    if (selected.state !== "selected") return selected;
    if (selected.noteTables.length) return unavailable("InvalidNoteBodyBindings");
    for (const table of selected.bodyTables) for (const cell of table.cells) for (const paragraph of cell.paragraphs)
      cellReferences.add(key(table.section, paragraph));
  }
  for (const paragraph of content.paragraphs) {
    if (!paragraph || !uint(paragraph.section) || !uint(paragraph.paragraph) || typeof paragraph.text !== "string"
      || paragraph.clipped || paragraphs.has(key(paragraph.section, paragraph.paragraph))) return unavailable("InvalidNoteBodyBindings");
    paragraphs.set(key(paragraph.section, paragraph.paragraph), paragraph);
  }
  for (const flow of content.paragraphFlows) {
    if (!flow || !uint(flow.section) || !uint(flow.paragraph) || flows.has(key(flow.section, flow.paragraph))) return unavailable("InvalidNoteBodyBindings");
    flows.set(key(flow.section, flow.paragraph), flow);
    const context = flow.note_context;
    if (!["footnote", "endnote"].includes(flow.host)) {
      if (context != null) return unavailable("InvalidNoteBodyBindings");
      continue;
    }
    if (!context || !uint(context.note_node) || !uint(context.list_node) || context.kind !== flow.host || flow.top_level !== false) return unavailable("MissingNoteBodyOwnership");
    const paragraph = paragraphs.get(key(flow.section, flow.paragraph));
    if (!paragraph || paragraph.tableCell || paragraph.drawingText || paragraph.tableCaption || paragraph.drawingCaption) return unavailable("InvalidNoteBodyBindings");
    const owner = key(flow.section, context.note_node);
    let note = notes.get(owner);
    if (!note) {
      if (notes.size >= maxNotes) return unavailable("NoteBodyBindingLimit");
      note = { section: flow.section, noteNode: context.note_node, listNode: context.list_node, kind: context.kind, paragraphs: [] };
      notes.set(owner, note);
    }
    if (note.listNode !== context.list_node || note.kind !== context.kind) return unavailable("AmbiguousNoteBodyOwnership");
    note.paragraphs.push(paragraph.paragraph);
  }
  const referenceAllowed = (section, paragraph) => {
    const flow = flows.get(key(section, paragraph));
    return flow?.host === "body" && flow.top_level === true || cellReferences.has(key(section, paragraph))
      || drawingReferences?.owners.has(key(section, paragraph));
  };
  for (const paragraph of content.paragraphs) {
    if (paragraph.automaticNumbers !== undefined && !Array.isArray(paragraph.automaticNumbers)) return unavailable("InvalidNoteBodyBindings");
    for (const reference of paragraph.automaticNumbers ?? []) {
      if (!reference) return unavailable("InvalidNoteBodyBindings");
      if (reference.kind !== "note-reference") continue;
      const owner = key(paragraph.section, reference.noteNode), note = notes.get(owner);
      if (!note || !referenceAllowed(paragraph.section, paragraph.paragraph) || !uint(reference.unit)
        || paragraph.text[reference.unit] !== "\ufffc" || !uint(reference.numberNode)
        || reference.source?.values?.raw?.[1] !== (note.kind === "footnote" ? "FOOTNOTE" : "ENDNOTE")) return unavailable("NoteBodyReferenceMismatch");
      if (references.has(owner)) return unavailable("AmbiguousNoteBodyReference");
      references.set(owner, { hostParagraph: paragraph.paragraph, anchorUnit: reference.unit, numberNode: reference.numberNode });
    }
  }
  // HWP5 참조는 XML 자동 번호 보고서로 합성하지 않고 검증된 native 연결을 사용합니다.
  if (content.hwp5NoteErrors?.length || content.hwp5Notes !== undefined && !Array.isArray(content.hwp5Notes)) return unavailable("InvalidNoteBodyBindings");
  for (const reference of content.hwp5Notes ?? []) {
    if (!reference || !uint(reference.section) || !uint(reference.controlNode) || !uint(reference.listNode) || !uint(reference.hostParagraph)) return unavailable("NoteBodyReferenceMismatch");
    const owner = key(reference.section, reference.controlNode), note = notes.get(owner);
    const paragraph = paragraphs.get(key(reference.section, reference.hostParagraph));
    if (!note || note.kind !== reference.kind || note.listNode !== reference.listNode
      || !referenceAllowed(reference.section, reference.hostParagraph) || !uint(reference.anchorUnit)
      || paragraph?.text[reference.anchorUnit] !== "\ufffc" || !uint(reference.controlNode)
      || !Array.isArray(reference.paragraphs) || reference.paragraphs.length !== note.paragraphs.length
      || new Set(reference.paragraphs).size !== reference.paragraphs.length
      || reference.paragraphs.some(id => !note.paragraphs.includes(id))) return unavailable("NoteBodyReferenceMismatch");
    if (references.has(owner)) return unavailable("AmbiguousNoteBodyReference");
    references.set(owner, { hostParagraph: reference.hostParagraph, anchorUnit: reference.anchorUnit, numberNode: reference.controlNode });
  }
  if (notes.size !== references.size) return unavailable("MissingNoteBodyReference");
  return { state: "bound", notes: [...notes.entries()].map(([owner, note]) => ({ ...note, paragraphs: note.paragraphs.toSorted((a, b) => a - b), ...references.get(owner) })) };
}
