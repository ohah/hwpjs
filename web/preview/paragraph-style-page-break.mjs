// Current style flags supplement explicit paragraph breaks without mutating
// the native flow snapshot or assigning physical pages in the reader.
export function paragraphStylePageBreaks(content) {
  if (
    content?.format !== "hwpx" ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(content.paragraphFlows)
  )
    return content;
  const selected = new Set(
    content.paragraphs
      .filter((p) => p.paragraphShape?.breakSettings?.page_break_before === true)
      .map((p) => `${p.section}:${p.paragraph}`),
  );
  let changed = false;
  const paragraphFlows = content.paragraphFlows.map((flow) => {
    if (
      flow.top_level !== true ||
      flow.page_break === true ||
      !selected.has(`${flow.section}:${flow.paragraph}`)
    )
      return flow;
    changed = true;
    return { ...flow, page_break: true };
  });
  return changed ? { ...content, paragraphFlows } : content;
}
