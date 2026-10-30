// Derived public selection identity only. Native current-reference validation owns edits.
const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const epoch = (s) =>
  typeof s === 'string' && /^[1-9][0-9]{0,19}$/.test(s) && BigInt(s) <= 0xffffffffffffffffn;
const key = (s, p) => `${s}:${p}`;

/** Called only while assembling a full actual HWP5 Runtime reply, before publication. */
export function attachHwp5NoteSelectionOwners(content) {
  if (
    content?.format !== 'hwp5' ||
    content.window ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(content.currentParagraphFlows) ||
    !Array.isArray(content.hwp5Notes) ||
    !content.hwp5Notes.length ||
    !Array.isArray(content.hwp5NoteErrors) ||
    content.hwp5NoteErrors.length ||
    !Array.isArray(content.flowSourceErrors) ||
    content.flowSourceErrors.length
  )
    return content;
  const rows = new Map(),
    flows = new Map(),
    promoted = new Map();
  for (const row of content.paragraphs) {
    if (
      !row ||
      !uint(row.section) ||
      !uint(row.paragraph) ||
      rows.has(key(row.section, row.paragraph))
    )
      return content;
    rows.set(key(row.section, row.paragraph), row);
  }
  for (const flow of content.currentParagraphFlows) {
    if (
      !flow ||
      !uint(flow.section) ||
      !uint(flow.paragraph) ||
      flows.has(key(flow.section, flow.paragraph))
    )
      return content;
    flows.set(key(flow.section, flow.paragraph), flow);
  }
  const sourceRef = (row, flow) => {
    const ref = row?.currentReference;
    return ref &&
      flow &&
      flow.generated === false &&
      uint(flow.source_node) &&
      flow.template_node === flow.source_node &&
      ref.kind === 'original' &&
      ref.section === row.section &&
      ref.id === String(flow.source_node) &&
      ref.row === 0 &&
      ref.column === 0 &&
      epoch(ref.epoch) &&
      typeof ref.scope === 'string' &&
      ref.scope.length > 0 &&
      Object.keys(ref).sort().join(',') === 'column,epoch,id,kind,row,scope,section'
      ? ref
      : null;
  };
  for (const note of content.hwp5Notes) {
    if (
      !note ||
      !uint(note.section) ||
      !uint(note.controlNode) ||
      !uint(note.listNode) ||
      !uint(note.hostParagraph) ||
      !['footnote', 'endnote'].includes(note.kind) ||
      !Array.isArray(note.paragraphs) ||
      !note.paragraphs.length ||
      note.source?.kind !== note.kind ||
      note.source.control_node !== note.controlNode ||
      note.source.list_node !== note.listNode ||
      note.source.paragraph !== note.hostParagraph ||
      note.source.paragraph_count !== note.paragraphs.length
    )
      return content;
    const host = rows.get(key(note.section, note.hostParagraph)),
      hostFlow = flows.get(key(note.section, note.hostParagraph));
    const hostRef = sourceRef(host, hostFlow);
    if (
      !hostRef ||
      host.clipped ||
      hostFlow.host !== 'body' ||
      hostFlow.top_level !== true ||
      hostFlow.parent_node !== null
    )
      return content;
    for (const paragraph of note.paragraphs) {
      if (!uint(paragraph)) return content;
      const id = key(note.section, paragraph),
        row = rows.get(id),
        flow = flows.get(id),
        ref = sourceRef(row, flow);
      if (
        !ref ||
        !row ||
        row.clipped ||
        row.selectionOwner != null ||
        row.tableCell ||
        row.drawingText ||
        row.drawingCaption ||
        row.createdCell ||
        promoted.has(id) ||
        flow.top_level !== false ||
        flow.host !== note.kind ||
        flow.parent_node !== note.controlNode ||
        flow.list_node !== note.listNode ||
        ref.scope !== hostRef.scope ||
        ref.epoch !== hostRef.epoch
      )
        return content;
      // Opaque identity is derived from agreed native note/list + the live issuer scope/epoch.
      const owner =
        'hwp5-note:' +
        JSON.stringify([
          note.section,
          note.kind,
          note.controlNode,
          note.listNode,
          ref.scope,
          ref.epoch,
        ]);
      promoted.set(id, { ...row, selectionOwner: owner });
    }
  }
  // No native state, cached raw reply, currentReference, source offsets or editability is replaced.
  return {
    ...content,
    paragraphs: content.paragraphs.map(
      (row) => promoted.get(key(row.section, row.paragraph)) ?? row,
    ),
  };
}
