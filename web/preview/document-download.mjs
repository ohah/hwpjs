// Browser-only export boundary. The caller supplies a native saved snapshot.
export function downloadDocument(snapshot, originalName, browser = globalThis) {
  if (!(snapshot?.bytes instanceof Uint8Array) || snapshot.bytes.length === 0) throw new Error("InvalidSavedBytes");
  if (!["hwp5", "hwpx"].includes(snapshot.format)) throw new Error("UnknownDocumentFormat");
  const extension = snapshot.format === "hwpx" ? "hwpx" : "hwp";
  const base = String(originalName).split(/[\\/]/).pop().replace(/\.(hwp|hwpx)$/i, "").replace(/[\u0000-\u001f\u007f]/g, "") || "document";
  const link = browser.document.createElement("a");
  const url = browser.URL.createObjectURL(new browser.Blob([snapshot.bytes], { type: "application/octet-stream" }));
  try {
    link.href = url; link.download = `${base}.edited.${extension}`;
    browser.document.body.append(link); link.click();
  } finally {
    link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
  }
}
