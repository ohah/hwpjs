const states = ["located", "conditional", "unsupported_anchor", "missing_host", "ambiguous_host"];
export function decodePictureSites(bytes) {
  const fail = () => { throw new Error("InvalidPictureSites"); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x31585048) fail();
  const count = view.getUint32(4, true);
  if (count > 100000 || bytes.length !== 8 + count * 16) fail();
  const result = [], seen = new Set();
  for (let index = 0; index < count; index++) {
    const at = 8 + index * 16;
    const pictureNode = view.getUint32(at, true), paragraphValue = view.getUint32(at + 4, true);
    const unitValue = view.getUint32(at + 8, true), flags = view.getUint32(at + 12, true);
    const stateIndex = flags & 255, hasParagraph = Boolean(flags & 256), hasUnit = Boolean(flags & 512);
    if ((flags & ~0x307) || stateIndex > 4 || seen.has(pictureNode)) fail();
    if (hasParagraph && paragraphValue === 0) fail();
    if ((!hasParagraph && paragraphValue !== 0) || (!hasUnit && unitValue !== 0)) fail();
    if ((stateIndex === 0) !== hasUnit || (hasUnit && !hasParagraph)) fail();
    if ((stateIndex === 2) !== (hasParagraph && !hasUnit)) fail();
    seen.add(pictureNode);
    result.push({ pictureNode, paragraph: hasParagraph ? paragraphValue : null, anchorUnit: hasUnit ? unitValue : null, state: states[stateIndex] });
  }
  return result;
}
