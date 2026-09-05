/** Produce an independently rearranged MiniFAT chain using legacy output as a seed. */
export function miniFragmented(CFB) {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(
    container,
    "/Fragmented",
    Buffer.from(Array.from({ length: 65 }, (_, i) => i)),
  );
  const bytes = CFB.write(container, { type: "buffer" });
  const parsed = CFB.read(bytes, { type: "buffer" });
  const entry = CFB.find(parsed, "Fragmented"),
    index = parsed.FileIndex.indexOf(entry);
  const miniFatOffset = (bytes.readUInt32LE(60) + 1) * 512;
  const first = entry.start,
    second = bytes.readUInt32LE(miniFatOffset + first * 4);
  const payloadOffset = (parsed.FileIndex[0].start + 1) * 512;
  const block = Buffer.from(
    bytes.subarray(
      payloadOffset + first * 64,
      payloadOffset + (first + 1) * 64,
    ),
  );
  bytes.copy(
    bytes,
    payloadOffset + first * 64,
    payloadOffset + second * 64,
    payloadOffset + (second + 1) * 64,
  );
  block.copy(bytes, payloadOffset + second * 64);
  bytes.writeUInt32LE(first, miniFatOffset + second * 4);
  bytes.writeUInt32LE(0xfffffffe, miniFatOffset + first * 4);
  const directoryOffset = (bytes.readUInt32LE(48) + 1) * 512;
  bytes.writeUInt32LE(second, directoryOffset + index * 128 + 116);
  return bytes;
}
