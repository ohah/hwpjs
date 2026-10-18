// An explicit HTTPS origin never grants ownership of its existing server.
import { createHash } from "node:crypto";
export function parseBrowserAuditOrigin(value) {
  if (value === undefined) return null;
  let url;
  try { url = new URL(value); } catch { throw Error("InvalidBrowserAuditOrigin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || ![url.origin, url.origin + "/"].includes(value)) throw Error("InvalidBrowserAuditOrigin");
  return url.origin;
}

export async function verifyBrowserSourceResponses(origin, hashes, fetchBytes = fetch) {
  for (const [path, expected] of Object.entries(hashes)) {
    if (!path.startsWith("web/preview/") && !path.startsWith("js/")) continue;
    const response = await fetchBytes(`${origin}/${path}`, { signal: AbortSignal.timeout(10000), redirect: "error" });
    if (response.status !== 200) throw Error(`BrowserRemoteSourceUnavailable:${path}`);
    const hash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (hash !== expected) throw Error(`BrowserRemoteSourceChanged:${path}`);
  }
}
