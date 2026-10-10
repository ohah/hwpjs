// 내부 목록의 현재 흐름만 선택합니다. section-wide single_column은 사용하지 않습니다.
export function drawingColumnContext(drawing, paragraphs, flows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!drawing?.source || !Array.isArray(paragraphs) || !Array.isArray(flows)) return unavailable("InvalidDrawingColumnContext");
  const members = paragraphs.filter(p => p.section === drawing.section && p.drawingText?.drawingNode === drawing.drawingNode);
  if (drawing.source.text === null) return members.length ? unavailable("DrawingTextDisplayBindingMismatch") : { state: "selected", source: "no-text-list", declaration: null };
  if (!drawing.source.text) return unavailable("InvalidDrawingColumnContext");
  if (!members.length) return unavailable("MissingDrawingTextContent");
  let selected, signature;
  for (const member of members) {
    if (member.drawingText.listNode !== drawing.source.text.list_node) return unavailable("DrawingTextDisplayBindingMismatch");
    const candidates = flows.filter(f => f.section === member.section && f.paragraph === member.paragraph);
    if (candidates.length !== 1 || candidates[0].host !== "drawing" || candidates[0].top_level !== false) return unavailable("AmbiguousDrawingColumnContext");
    const declaration = candidates[0].column_declaration;
    if (declaration === undefined) return unavailable("MissingDrawingColumnContext");
    const current = JSON.stringify(declaration);
    if (signature !== undefined && signature !== current) return unavailable("UnsupportedDrawingColumnChange");
    signature = current; selected = declaration;
  }
  if (selected === null) return { state: "selected", source: "implicit-single-list", declaration: { count: 1, same_size: true, gap: 0, direction: "left", kind: "newspaper", ambiguous: false } };
  return { state: "selected", source: "list-declaration", declaration: structuredClone(selected) };
}
