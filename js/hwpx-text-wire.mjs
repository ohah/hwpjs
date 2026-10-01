const kinds = ["paragraph_start", "paragraph_end", "run_start", "run_end", "text_start", "text_end", "content", "inline_start", "inline_end", "inline_empty"];
const inlineKinds = ["tab", "fw_space", "nb_space", "line_break", "title_mark", "markpen_begin", "markpen_end", "hypen", "unknown"];
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Private HXT1 transport. Source tags and decoded content remain distinct. */
export function decodeHwpxText(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const invalid = () => { throw new Error("InvalidHwpxTextWire"); };
  const word = () => {
    if (offset + 4 > bytes.length) invalid();
    const value = view.getUint32(offset, true); offset += 4; return value;
  };
  if (word() !== 0x31545848) invalid();
  const sectionCount = word(), paragraphCount = word(), eventCount = word();
  if (sectionCount > 4096 || eventCount > (bytes.length - offset) / 32 || paragraphCount > eventCount / 2) invalid();
  const events = [];
  let starts = 0, ends = 0;
  for (let i = 0; i < eventCount; i++) {
    const section = word(), itemIndex = word(), paragraph = word(), run = word(), text = word();
    const kind = word(), inline = word(), length = word();
    if (section >= sectionCount || paragraph === 0 || kind >= kinds.length || length > bytes.length - offset) invalid();
    if (kind >= 7 ? inline >= inlineKinds.length : inline !== 0xffffffff) invalid();
    if (kind === 5 && length !== 0) invalid();
    const raw = Uint8Array.from(bytes.subarray(offset, offset + length)); offset += length;
    let value;
    try { value = decoder.decode(raw); } catch { invalid(); }
    if (kind === 0) starts++;
    if (kind === 1) ends++;
    events.push({ section, itemIndex, paragraph, run, text, kind: kinds[kind], inlineKind: kind >= 7 ? inlineKinds[inline] : null, value, raw });
  }
  if (offset !== bytes.length || starts !== paragraphCount || ends !== paragraphCount) invalid();
  return { format: "hwpx", branchPolicy: "selected_default", sectionCount, paragraphCount, events };
}
