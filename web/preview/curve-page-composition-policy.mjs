// 연결된 배치 경로만 선택합니다. 소유권 검증과 실제 배치는 각 소비자가 수행합니다.
export function curvePageCompositionConnected(content, overrides = []) {
  if (
    content.pageSettings?.length !== 1 ||
    content.createdTables?.length ||
    content.ellipses?.length ||
    content.oles?.length ||
    content.hwp5PageNumberSource ||
    overrides.some((value) => value !== undefined)
  )
    return false;
  const roots = (content.containers ?? []).filter((row) => row.source?.group_context === null);
  if (
    !roots.length ||
    new Set(roots.map((root) => `${root.section}:${root.containerNode}`)).size !== roots.length
  )
    return false;
  if (
    roots.every(
      (root) =>
        root.source.geometry?.treat_as_character === true &&
        (content.paragraphFlows ?? []).filter(
          (flow) =>
            flow.section === root.section &&
            flow.paragraph === root.hostParagraph &&
            flow.host === "body" &&
            flow.top_level === true,
        ).length === 1,
    ) &&
    content.paragraphFlows?.every((flow) => ["body", "drawing"].includes(flow.host))
  )
    return true;
  return (
    (content.curveTextSources ?? []).length > 0 &&
    content.curveTextSources.every((curve) => {
      const matches = roots.filter(
        (root) =>
          root.section === curve.section &&
          root.containerNode === curve.source?.common?.group_context?.root_anchor,
      );
      if (matches.length !== 1 || matches[0].source.geometry?.treat_as_character !== true)
        return false;
      const root = matches[0],
        flows = (content.paragraphFlows ?? []).filter(
          (flow) => flow.section === root.section && flow.paragraph === root.hostParagraph,
        );
      if (flows.length !== 1) return false;
      const flow = flows[0],
        note = flow.note_context;
      return (
        flow.host === "endnote" &&
        flow.top_level === false &&
        note?.kind === "endnote" &&
        [note.note_node, note.list_node].every((value) => Number.isSafeInteger(value) && value >= 0)
      );
    })
  );
}
