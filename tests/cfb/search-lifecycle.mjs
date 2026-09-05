// Browser/Node shared regression: the expected answers come from the legacy engine.
export function checkSearchLifecycle(reference, reader) {
  const source = reference.utils.cfb_new();
  for (const name of [
    "/Straße/ﬃ",
    "/한글/표😀",
    "/\u0001Control",
    "/\ufffd",
    "/\u1c8a",
  ])
    reference.utils.cfb_add(source, name, new Uint8Array([1]));
  const bytes = reference.write(source, { type: "buffer" });
  const expected = reference.read(bytes, { type: "buffer" });
  const saved = reader.parse(bytes);
  const queries = [
    "missing",
    "/STRASSE/FFI",
    "!control",
    "\ud800",
    "\udc00",
    "\u1c89",
  ];
  expected.FileIndex.forEach((entry, i) =>
    queries.push(
      entry.name,
      entry.name.toLowerCase(),
      entry.name + "\0",
      expected.FullPaths[i],
      "/" + expected.FullPaths[i].split("/").slice(1).join("/"),
    ),
  );
  let searches = 0;
  for (const phase of ["active", "replaced", "failed-open", "closed"]) {
    if (phase === "replaced") reader.parse(bytes);
    if (phase === "failed-open") {
      try {
        reader.parse(new Uint8Array(8));
        throw new Error("Expected parse failure");
      } catch (error) {
        if (error.message === "Expected parse failure") throw error;
      }
    }
    if (phase === "closed") reader.close();
    for (const query of queries) {
      const actualIndex = saved.FileIndex.indexOf(reader.find(saved, query));
      const expectedIndex = expected.FileIndex.indexOf(
        reference.find(expected, query),
      );
      if (actualIndex !== expectedIndex)
        throw new Error(
          `${phase}: ${JSON.stringify(query)}: ${actualIndex} != ${expectedIndex}`,
        );
      searches++;
    }
  }
  return searches;
}
