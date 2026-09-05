export async function checkBrowserBoundaries(reference, reader) {
  const source = reference.utils.cfb_new();
  reference.utils.cfb_add(source, "/\ufeffData", new Uint8Array([65]));
  const bytes = new Uint8Array(reference.write(source, { type: "buffer" }));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = (view.getUint32(48, true) + 1) * 512;
  const ticks = 0x8000000000000000n;
  view.setBigUint64(directory + 100, ticks, true);
  const saved = reader.parse(bytes);
  const entry = reader.find(saved, "\ufeffData");
  if (entry?.name !== "\ufeffData") throw new Error("Leading BOM was lost");
  if (
    Math.abs(
      saved.FileIndex[0].ct.getTime() -
        Number(ticks / 10000n - 11644473600000n),
    ) > 1
  )
    throw new Error("FILETIME signedness");
  reader.close();
  if (
    reader.find(saved, "\ufeffData") !== entry ||
    reader.find(saved, "Data") !== null
  )
    throw new Error("BOM lookup changed after close");
  const frame = document.createElement("iframe");
  frame.hidden = true;
  try {
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = "about:blank";
      document.body.appendChild(frame);
    });
    const foreign = new frame.contentWindow.ArrayBuffer(bytes.length);
    new frame.contentWindow.Uint8Array(foreign).set(bytes);
    const parsed = reader.parse(foreign);
    if (reader.find(parsed, "\ufeffData")?.content[0] !== 65)
      throw new Error("Cross-realm buffer bytes changed");
  } finally {
    frame.remove();
    reader.close();
  }
  return { bom: true, unsignedFiletime: true, crossRealm: true };
}
