// Browser-only export boundary. The caller supplies a native saved snapshot.
export function downloadDocument(snapshot, originalName, browser = globalThis) {
  if (!(snapshot?.bytes instanceof Uint8Array) || snapshot.bytes.length === 0)
    throw new Error("InvalidSavedBytes");
  if (!["hwp5", "hwpx"].includes(snapshot.format)) throw new Error("UnknownDocumentFormat");
  const extension = snapshot.format === "hwpx" ? "hwpx" : "hwp";
  const base =
    String(originalName)
      .split(/[\\/]/)
      .pop()
      .replace(/\.(hwp|hwpx)$/i, "")
      // oxlint-disable-next-line no-control-regex -- 다운로드 파일명에서 C0·DEL 제어문자를 제거하는 입력 보호다.
      .replace(/[\u0000-\u001f\u007f]/g, "") || "document";
  const link = browser.document.createElement("a");
  const url = browser.URL.createObjectURL(
    new browser.Blob([snapshot.bytes], { type: "application/octet-stream" }),
  );
  let failed = false,
    failure;
  const remember = (error) => {
    if (!failed) {
      failed = true;
      failure = error;
    }
  };
  try {
    link.href = url;
    link.download = `${base}.edited.${extension}`;
    browser.document.body.append(link);
    link.click();
  } catch (error) {
    remember(error);
  }
  try {
    link.remove();
  } catch (error) {
    remember(error);
  }
  try {
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
  } catch (error) {
    remember(error);
    try {
      browser.URL.revokeObjectURL(url);
    } catch (error) {
      remember(error);
    }
  }
  if (failed) throw failure;
}
