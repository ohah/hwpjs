export function checkBrowserWriter(reader, reference) {
  let cases = 0;
  for (const version of [3, 4])
    for (const size of [0, 1, 64, 65, 4095, 4096, 4097]) {
      const content = Uint8Array.from({ length: size }, (_, i) => i % 251);
      const bytes = reader.write({
        version,
        nodes: [
          { name: "Root Entry", kind: 5 },
          { name: "Data", parent: 0, content },
        ],
      });
      reader.parse(bytes, { strict: true });
      const node = reader.document().nodes[1],
        found = reader.findExact("/Data");
      if (
        node.content.length !== size ||
        node.content.some((b, i) => b !== content[i]) ||
        found.size !== size
      )
        throw Error("writer roundtrip");
      const legacy = reference.parse(bytes).FileIndex[1].content ?? [];
      if (
        legacy.length !== size ||
        Array.from(legacy).some((b, i) => b !== content[i])
      )
        throw Error("writer independent parser");
      const edit = reader.document();
      edit.nodes[1].name = "Edit";
      edit.nodes[1].content = Uint8Array.of(42);
      reader.parse(reader.write(edit), { strict: true });
      if (
        reader.findExact("/Edit").content[0] !== 42 ||
        reader.findExact("/Data") !== null
      )
        throw Error("writer edit");
      cases++;
    }
  reader.close();
  return cases;
}
