/** Bounded plain-title projection. Never infer ownership from run order. */
export function chartPreviewTitle(display) {
  const rich = display.rich_text ?? [];
  const absent = code => ({ title: null, warnings: code ? [code] : [] });
  if (!rich.length) return absent();
  if (rich.some(row => row.owner_role === undefined)) return absent("SourceChartTitleMetadataUnavailable");
  const rows = rich.filter(row => row.owner_role === "chart_title");
  if (!rows.length) return absent();
  const first = rows[0];
  if (rows.some(row => row.owner_node !== first.owner_node || row.text_node !== first.text_node || row.rich_node !== first.rich_node)) return absent("SourceChartTitleAmbiguous");
  if (rows.some(row => row.plain_text_complete !== true)) return absent("SourceChartTitleTextIncomplete");
  const seen = new Set(), lines = [""]; let paragraph, characters = 0, shortened = false, exhausted = false, previousCR = false;
  const newline = () => {
    if (lines.length === 3) { shortened = exhausted = true; return; }
    lines.push(""); characters = 0;
  };
  for (const row of rows) {
    if (typeof row.text !== "string" || !row.text.isWellFormed()) return absent("SourceChartTitleTextIncomplete");
    if (paragraph !== row.paragraph_node) {
      if (seen.has(row.paragraph_node)) return absent("SourceChartTitleAmbiguous");
      if (paragraph !== undefined && !exhausted) newline();
      paragraph = row.paragraph_node; seen.add(paragraph); previousCR = false;
    }
    if (exhausted) continue;
    for (const character of row.text) {
      if (character === "\n" && previousCR) { previousCR = false; continue; }
      previousCR = character === "\r";
      if (character === "\r" || character === "\n") newline();
      else if (characters === 128) shortened = exhausted = true;
      else { lines[lines.length - 1] += character; characters++; }
      if (exhausted) break;
    }
  }
  if (shortened) lines[lines.length - 1] += "…";
  return { title: { owner_node: first.owner_node, lines, shortened }, warnings: ["PreviewPlainChartTitle", ...(shortened ? ["PreviewChartTitleShortened"] : [])] };
}
