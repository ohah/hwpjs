import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { auditDocs } from "../../tools/docs-audit-status.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");

test("document audit distinguishes current, stale, pending, missing and unknown entries", () => {
  const content = new Map([
    ["a.md", Buffer.from("same")],
    ["b.md", Buffer.from("new")],
    ["c.md", Buffer.from("pending")],
    ["e.md", Buffer.from("invalid")],
  ]);
  const result = auditDocs(
    ["a.md", "b.md", "c.md", "d.md", "e.md"],
    {
      "a.md": { sha256: hash("same"), evidence: "checked" },
      "b.md": { sha256: hash("old"), evidence: "checked" },
      "d.md": { sha256: hash("missing"), evidence: "checked" },
      "e.md": { sha256: hash("invalid"), evidence: "" },
      "ghost.md": { sha256: hash("ghost"), evidence: "checked" },
    },
    path => content.get(path) ?? null,
    ["new.md"],
  );
  assert.deepEqual(result, {
    tracked: 5,
    verified_current: ["a.md"],
    pending: ["c.md"],
    stale: ["b.md"],
    missing: ["d.md"],
    untracked: ["new.md"],
    invalid_verified: ["e.md"],
    unknown_verified: ["ghost.md"],
  });
});
