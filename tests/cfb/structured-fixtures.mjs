// Independent encoder: no production parser, ABI schema or legacy writer imports.
export function miniContainer(version, size, fragmented, salt = 0) {
  const sector = version === 3 ? 512 : 4096;
  const blocks = Math.ceil(size / 64);
  const rootSize = blocks * 64;
  const dataSectors = Math.ceil(rootSize / sector);
  const bytes = Buffer.alloc((4 + dataSectors) * sector);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(bytes);
  for (const [o, n] of [
    [24, 62],
    [26, version],
    [28, 65534],
    [30, version === 3 ? 9 : 12],
    [32, 6],
  ])
    bytes.writeUInt16LE(n, o);
  for (const [o, n] of [
    [40, version === 4 ? 1 : 0],
    [44, 1],
    [48, 1],
    [56, 4096],
    [60, 2],
    [64, 1],
    [68, 0xfffffffe],
  ])
    bytes.writeUInt32LE(n, o);
  bytes.fill(255, 76, 512);
  bytes.writeUInt32LE(0, 76);
  bytes.fill(255, sector, 2 * sector);
  bytes.writeUInt32LE(0xfffffffd, sector);
  bytes.writeUInt32LE(0xfffffffe, sector + 4);
  bytes.writeUInt32LE(0xfffffffe, sector + 8);
  for (let i = 0; i < dataSectors; i++)
    bytes.writeUInt32LE(
      i + 1 === dataSectors ? 0xfffffffe : i + 4,
      sector + (i + 3) * 4,
    );
  function entry(index, name, kind, start, length, child) {
    const o = 2 * sector + index * 128;
    const encoded = Buffer.from(name + "\0", "utf16le");
    encoded.copy(bytes, o);
    bytes.writeUInt16LE(encoded.length, o + 64);
    bytes[o + 66] = kind;
    bytes[o + 67] = 1;
    for (const [field, value] of [
      [68, 0xffffffff],
      [72, 0xffffffff],
      [76, child],
      [116, start],
      [120, length],
    ])
      bytes.writeUInt32LE(value, o + field);
  }
  entry(0, "Root Entry", 5, dataSectors ? 3 : 0xfffffffe, rootSize, 1);
  entry(
    1,
    "Data",
    2,
    blocks ? (fragmented ? blocks - 1 : 0) : 0xfffffffe,
    size,
    0xffffffff,
  );
  bytes.fill(255, 3 * sector, 4 * sector);
  const expected = Buffer.from(
    Array.from({ length: size }, (_, i) => (i * 17 + salt) % 251),
  );
  for (let i = 0; i < blocks; i++) {
    const physical = fragmented ? blocks - 1 - i : i;
    const next =
      i + 1 === blocks ? 0xfffffffe : fragmented ? physical - 1 : physical + 1;
    bytes.writeUInt32LE(next, 3 * sector + physical * 4);
    expected.copy(
      bytes,
      4 * sector + physical * 64,
      i * 64,
      Math.min(size, (i + 1) * 64),
    );
  }
  return { bytes, expected };
}
