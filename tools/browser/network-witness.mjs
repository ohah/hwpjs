// Diagnostic only: no retries, routing changes, or document mutations.
export function captureBrowserNetworkWitness({ command, evaluate }, harPath) {
  const result = { harPath };
  try {
    result.page = evaluate(
      '({status:document.querySelector("#status")?.textContent??null,fileDisabled:document.querySelector("#file")?.disabled??null})',
    );
  } catch {
    result.pageUnavailable = true;
  }
  try {
    const rows = command("network", "requests").requests;
    if (!Array.isArray(rows)) throw Error("InvalidNetworkInventory");
    const path = (row) => {
      try {
        const url = new URL(row.url);
        return url.origin + url.pathname;
      } catch {
        return "<invalid-url>";
      }
    };
    result.requestCount = rows.length;
    result.unfinishedScripts = rows
      .filter((row) => row.resourceType === "Script" && !row.status)
      .map((row) => path(row));
    result.httpFailures = rows
      .filter((row) => Number.isInteger(row.status) && row.status >= 400)
      .map((row) => ({ url: path(row), status: row.status }));
  } catch {
    result.networkUnavailable = true;
  }
  try {
    command("network", "har", "stop", harPath);
    result.harSaved = true;
  } catch {
    result.harSaved = false;
  }
  return result;
}
