import { createImageByteRequests } from "./image-byte-requests.mjs";
export function createTableBackgroundRequests(post, timeoutMs = 30000) {
  return createImageByteRequests(
    post,
    {
      kind: "table-background-bytes",
      field: "listNode",
      prefix: "table-background",
      timeoutError: "TableBackgroundReadTimeout",
      invalidReply: "InvalidTableBackgroundReply",
      documentChanged: "TableBackgroundDocumentChanged",
      strictIdentity: true,
    },
    timeoutMs,
  );
}
