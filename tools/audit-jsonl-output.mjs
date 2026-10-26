import { writeSync } from "node:fs";

// Audit evidence must be completely written before a command can succeed.
export function writeAuditRow(value, write = writeSync) {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") throw new TypeError("InvalidAuditJsonRow");
  const bytes = Buffer.from(serialized + "\n");
  let offset = 0;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    const written = write(1, bytes, offset, remaining);
    if (!Number.isSafeInteger(written) || written <= 0 || written > remaining)
      throw new Error("AuditOutputWriteFailed");
    offset += written;
  }
}
