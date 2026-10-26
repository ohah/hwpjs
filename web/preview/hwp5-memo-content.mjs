// Native memo identity owns grouping. This is not a body anchor or page layout.
export function attachHwp5Memos(content) {
  content.hwp5Memos = [];
  content.hwp5MemoErrors = [];
  for (const paragraph of content.paragraphs ?? [])
    if (paragraph.memoSource) {
      const source = paragraph.memoSource;
      if (
        paragraph.selectionOwner ===
        `section:${paragraph.section}:memo:${source.memoNode}:list:${source.listNode}`
      )
        paragraph.selectionOwner = null;
      delete paragraph.memoSource;
      delete paragraph.memoLabel;
    }
  const flows = content.currentParagraphFlows ?? [];
  const sections = new Set(flows.filter((row) => row.memo_node != null).map((row) => row.section));
  for (const section of sections) {
    try {
      const paragraphs = new Map();
      for (const row of content.paragraphs ?? []) {
        if (row.section !== section) continue;
        if (paragraphs.has(row.paragraph)) throw new Error("AmbiguousHwp5MemoParagraph");
        paragraphs.set(row.paragraph, row);
      }
      const groups = new Map(),
        seen = new Set();
      for (const row of flows) {
        if (row.section !== section || row.memo_node == null) continue;
        if (seen.has(row.paragraph)) throw new Error("AmbiguousHwp5MemoParagraph");
        seen.add(row.paragraph);
        const paragraph = paragraphs.get(row.paragraph);
        if (!paragraph || paragraph.clipped) throw new Error("MissingHwp5MemoParagraph");
        if (
          !Number.isSafeInteger(row.memo_node) ||
          row.memo_node < 0 ||
          !Number.isSafeInteger(row.parent_node) ||
          row.parent_node < 0 ||
          row.host !== "other" ||
          row.top_level !== false ||
          row.list_node !== row.memo_node + 1 ||
          !Number.isSafeInteger(row.memo_index) ||
          row.memo_index < 0 ||
          row.memo_index > 0xffffffff
        )
          throw new Error("InvalidHwp5MemoIdentity");
        let group = groups.get(row.memo_node);
        if (!group) {
          group = {
            section,
            memoNode: row.memo_node,
            memoIndex: row.memo_index,
            listNode: row.list_node,
            parentNode: row.parent_node,
            paragraphs: [],
          };
          groups.set(row.memo_node, group);
        }
        if (
          group.memoIndex !== row.memo_index ||
          group.listNode !== row.list_node ||
          group.parentNode !== row.parent_node
        )
          throw new Error("ConflictingHwp5MemoIdentity");
        group.paragraphs.push(row.paragraph);
      }
      for (const group of groups.values())
        for (const index of group.paragraphs) {
          const paragraph = paragraphs.get(index);
          paragraph.memoSource = {
            memoNode: group.memoNode,
            memoIndex: group.memoIndex,
            listNode: group.listNode,
          };
          paragraph.selectionOwner = `section:${section}:memo:${group.memoNode}:list:${group.listNode}`;
          paragraph.memoLabel = `구역 ${section + 1} · 메모 ${group.memoIndex} · 문단 ${index + 1}`;
        }
      content.hwp5Memos.push(...groups.values());
    } catch (error) {
      content.hwp5MemoErrors.push({ section, error: error.message });
    }
  }
  return content;
}
