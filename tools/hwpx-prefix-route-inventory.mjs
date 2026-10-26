// Read-only route inventory. A selected route is not evidence of successful editing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureInputIdentity, verifyInputIdentity } from "./audit-input-identity.mjs";
import { parseEditAuditOptions } from "./hwpx-edit-audit-options.mjs";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { queryPrefixRoute } from "./hwpx-prefix-route-query.mjs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";

const options = parseEditAuditOptions(process.argv.slice(2), { requireWasm: true });
if (!options.fixture) throw new Error("MissingAuditFixture");
const input = readFileSync(options.fixture),
  wasm = readFileSync(options.wasm);
const inputSha256 = captureInputIdentity(input),
  wasmSha256 = captureInputIdentity(wasm);
const editor = await createHwpxEditor(wasm),
  reader = await createHwpxReader(wasm);
const counts = {},
  refused = [];
try {
  editor.open(input);
  for (const row of hwpxParagraphCoordinates(reader.readTextEvents(input).events)) {
    try {
      const route = queryPrefixRoute(editor, row.section, row.paragraph);
      assert.ok(["plain", "anchored", "field"].includes(route));
      counts[route] = (counts[route] ?? 0) + 1;
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      refused.push({ ...row, error: error.message });
    }
  }
  assert.deepEqual(Buffer.from(editor.save()), input, "queries changed original save bytes");
  verifyInputIdentity(input, inputSha256, options.fixture);
  verifyInputIdentity(wasm, wasmSha256, options.wasm);
  console.log(
    JSON.stringify({
      path: options.fixture,
      inputSha256,
      wasmSha256,
      counts,
      refused,
      scope:
        "all reader paragraphs; query-only prefix route selection, not editing or full parser/layout proof",
    }),
  );
  process.exitCode = refused.length ? 1 : 0;
} finally {
  editor.close();
  reader.close();
}
