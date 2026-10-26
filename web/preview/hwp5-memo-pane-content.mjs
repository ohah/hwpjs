// Separate known memo lists for UI annotations, without changing native host,
// source identity, editable flags or the stored section extension.
export function selectHwp5MemoPane(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    if (content.hwp5MemoErrors?.length) return fail("IncompleteHwp5MemoPaneSources");
    const groups = content.hwp5Memos ?? [],
      keys = new Set(),
      members = new Set(),
      counts = new Map();
    if (!Array.isArray(groups)) return fail("InvalidHwp5MemoPaneGroups");
    const paragraphs = new Map(),
      flows = new Map();
    const key = (section, paragraph) => `${section}:${paragraph}`;
    const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
    for (const p of content.paragraphs ?? []) {
      const k = key(p.section, p.paragraph);
      if (paragraphs.has(k)) throw Error("AmbiguousHwp5MemoPaneParagraph");
      paragraphs.set(k, p);
    }
    for (const flow of content.currentParagraphFlows ?? []) {
      const k = key(flow.section, flow.paragraph);
      if (flows.has(k)) throw Error("AmbiguousHwp5MemoPaneFlow");
      flows.set(k, flow);
    }
    for (const group of groups) {
      if (
        !group ||
        ![group.section, group.memoNode, group.memoIndex, group.listNode, group.parentNode].every(
          uint,
        ) ||
        group.parentNode >= group.memoNode ||
        group.listNode !== group.memoNode + 1 ||
        !Array.isArray(group.paragraphs) ||
        !group.paragraphs.length
      )
        throw Error("InvalidHwp5MemoPaneGroup");
      const identity = key(group.section, group.memoNode);
      if (keys.has(identity)) throw Error("AmbiguousHwp5MemoPaneGroup");
      keys.add(identity);
      counts.set(group.section, (counts.get(group.section) ?? 0) + 1);
      for (const index of group.paragraphs) {
        const k = key(group.section, index),
          p = paragraphs.get(k),
          flow = flows.get(k);
        if (!uint(index) || members.has(k) || !p || p.clipped || !flow)
          throw Error("MissingHwp5MemoPaneParagraph");
        const source = p.memoSource;
        if (
          !source ||
          source.memoNode !== group.memoNode ||
          source.memoIndex !== group.memoIndex ||
          source.listNode !== group.listNode ||
          p.selectionOwner !==
            `section:${group.section}:memo:${group.memoNode}:list:${group.listNode}` ||
          flow.memo_node !== group.memoNode ||
          flow.memo_index !== group.memoIndex ||
          flow.list_node !== group.listNode ||
          flow.parent_node !== group.parentNode ||
          flow.host !== "other" ||
          flow.top_level !== false
        )
          throw Error("Hwp5MemoPaneOwnerMismatch");
        if (
          flow.break_flags !== 0 ||
          p.tableCell ||
          p.drawingText ||
          p.tableCaption ||
          p.drawingCaption ||
          typeof p.text !== "string" ||
          p.text.includes("\ufffc") ||
          content.columnDisplaySources?.some(
            (row) => row.section === group.section && row.current_paragraph === index,
          )
        )
          throw Error("UnsupportedHwp5MemoPaneContent");
        members.add(k);
      }
    }
    for (const [k, p] of paragraphs)
      if (Boolean(p.memoSource) !== members.has(k)) throw Error("IncompleteHwp5MemoPaneMembership");
    for (const [k, flow] of flows)
      if ((flow.memo_node != null) !== members.has(k))
        throw Error("IncompleteHwp5MemoPaneMembership");
    if (
      [...(content.tables ?? []), ...(content.hwp5Drawings ?? [])].some((row) =>
        members.has(key(row.section, row.hostParagraph)),
      ) ||
      [...(content.pictures ?? []), ...(content.lines ?? [])].some((row) =>
        members.has(key(row.section, row.paragraph)),
      )
    )
      throw Error("UnsupportedHwp5MemoPaneObjects");
    const sections = new Set();
    for (const source of content.sectionSources ?? []) {
      if (sections.has(source.section)) throw Error("AmbiguousHwp5MemoPaneSection");
      sections.add(source.section);
      if ((source.memo_list_count ?? 0) !== (counts.get(source.section) ?? 0))
        throw Error("Hwp5MemoPaneCountMismatch");
    }
    if ([...counts.keys()].some((section) => !sections.has(section)))
      throw Error("MissingHwp5MemoPaneSection");
    if (!groups.length) return { state: "selected", content, groups: [], counts };
    return {
      state: "selected",
      counts,
      groups: groups.map((group) => ({
        ...group,
        paragraphs: group.paragraphs.map((index) => paragraphs.get(key(group.section, index))),
      })),
      content: {
        ...content,
        paragraphs: content.paragraphs.filter((p) => !members.has(key(p.section, p.paragraph))),
        currentParagraphFlows: content.currentParagraphFlows.filter(
          (p) => !members.has(key(p.section, p.paragraph)),
        ),
      },
    };
  } catch (error) {
    return fail(error.message);
  }
}
