// Test-side oracle: reconstruct parentage from raw record levels. It does not
// consume the Zig tree, Groups, note parser, or serialized report fields.
export function noteNumberLinksActual(section, layout = "observed12") {
  const nodes = [], ancestors = [];
  for (let offset = 0; offset < section.length;) {
    const word = section.readUInt32LE(offset);
    const depth = (word >>> 10) & 1023;
    let size = word >>> 20;
    const start = offset + (size === 4095 ? 8 : 4);
    if (size === 4095) size = section.readUInt32LE(offset + 4);
    const record = { tag: word & 1023, start, end: start + size };
    offset = record.end;
    ancestors.length = depth;
    const node = { ...record, children: [] };
    if (depth) nodes[ancestors[depth - 1]].children.push(node);
    nodes.push(node);
    ancestors.push(nodes.length - 1);
  }
  const out = Array(8).fill(0);
  for (const owner of nodes) {
    if (owner.tag !== 71) continue;
    const name = section.readUInt32LE(owner.start);
    if (name !== 0x666e2020 && name !== 0x656e2020) continue;
    let active = false, count = 0;
    for (const child of owner.children) {
      if (child.tag === 72) active = true;
      else if (active && child.tag === 66) {
        for (const field of child.children) {
          if (field.tag !== 71 || section.readUInt32LE(field.start) !== 0x61746e6f) continue;
          count++; out[0]++;
          const kind = section.readUInt32LE(field.start + 4) & 15;
          out[kind === (name === 0x666e2020 ? 1 : 2) ? 3 : 4]++;
          if (layout === "spec8") out[7]++;
          else {
            const number = section.readUInt16LE(field.start + 8);
            out[number === section.readUInt32LE(owner.start + 4) ? 5 : 6]++;
          }
        }
      }
    }
    if (count === 0) out[1]++;
    if (count > 1) out[2]++;
  }
  return out;
}
