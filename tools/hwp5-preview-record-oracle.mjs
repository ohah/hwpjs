// Independent JS framing walk for preview text-byte comparisons.
// Do not call the Zig record or text parser from here.
export function rawParagraphTexts(section) {
  const view = new DataView(section.buffer, section.byteOffset, section.byteLength);
  const paragraphs = [];
  const atLevel = [];
  for (let offset = 0; offset < section.length;) {
    if (offset + 4 > section.length) throw new Error("oracle truncated header");
    const bits = view.getUint32(offset, true);
    offset += 4;
    const tag = bits & 1023;
    const level = (bits >>> 10) & 1023;
    let length = bits >>> 20;
    if (length === 4095) {
      if (offset + 4 > section.length) throw new Error("oracle truncated length");
      length = view.getUint32(offset, true);
      offset += 4;
    }
    if (length > section.length - offset) throw new Error("oracle truncated payload");
    const data = section.subarray(offset, offset + length);
    offset += length;
    if (tag === 66) {
      atLevel[level] = paragraphs.length;
      paragraphs.push(null);
    } else if (tag === 67) {
      const owner = atLevel[level - 1];
      if (owner === undefined || paragraphs[owner] !== null) throw new Error("oracle invalid text owner");
      paragraphs[owner] = Buffer.from(data);
    }
  }
  return paragraphs;
}
