import test from "node:test";
import assert from "node:assert/strict";
import { parseSpecializedAuditOutput } from "../../tools/hwpx-specialized-audit-output.mjs";

test("specialized output retains refusal witnesses before compact or pretty summary", () => {
  const start = { kind: "start", wasmSha256: "candidate" };
  const refusal = { kind: "refusal", path: "chart.hwpx", section: 0, paragraph: 24, localParagraph: 24, error: "ProtectedFieldRange" };
  const summary = { attempts: 2, verified: 1, refused: { ProtectedFieldRange: 1 } };
  for (const pretty of [undefined, 2]) {
    const output = [JSON.stringify(start), JSON.stringify(refusal), JSON.stringify(summary, null, pretty)].join("\n");
    const boundary = output.indexOf("\n");
    assert.throws(() => JSON.parse(output.slice(boundary + 1)), SyntaxError);
    assert.deepEqual(parseSpecializedAuditOutput(output), { start, refusals: [refusal], summary });
    const empty = { ...summary, refused: {} };
    assert.deepEqual(parseSpecializedAuditOutput([JSON.stringify(start), JSON.stringify(empty, null, pretty)].join("\n")), { start, refusals: [], summary: empty });
  }
});

test("specialized output refuses malformed witnesses and disagreement with totals", () => {
  const start = { kind: "start" }, refusal = { kind: "refusal", path: "chart.hwpx", section: 0, paragraph: 24, localParagraph: 24, error: "ProtectedFieldRange" };
  const output = (rows, counts) => [start, ...rows, { refused: counts }].map(row => JSON.stringify(row)).join("\n");
  for (const counts of [{}, { ProtectedFieldRange: 2 }, { Other: 1 }, { ProtectedFieldRange: -1 }, { ProtectedFieldRange: "1" }]) {
    assert.throws(() => parseSpecializedAuditOutput(output([refusal], counts)));
  }
  assert.throws(() => parseSpecializedAuditOutput(output([], { ProtectedFieldRange: 1 })));
  assert.throws(() => parseSpecializedAuditOutput(output([refusal, refusal], { ProtectedFieldRange: 2 })), /DuplicateSpecializedAuditRefusal/);
  for (const patch of [{ path: "" }, { section: -1 }, { paragraph: 0 }, { localParagraph: 1.5 }, { error: "" }]) {
    assert.throws(() => parseSpecializedAuditOutput(output([{ ...refusal, ...patch }], { ProtectedFieldRange: 1 })), /InvalidSpecializedAuditRefusal/);
  }
});

test("specialized output rejects missing summaries unknown rows and truncated JSON", () => {
  for (const output of ["", "{}\n{}", '{"kind":"start"}', '{"kind":"start"}\n{"kind":"refusal"}',
    '{"kind":"start"}\n{"kind":"unexpected"}\n{}', '{"kind":"start"}\n{', '{"kind":"start"}\n[]']) {
    assert.throws(() => parseSpecializedAuditOutput(output));
  }
});
