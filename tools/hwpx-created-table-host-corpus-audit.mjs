// One eligible source host per tracked unencrypted fixture; not every paragraph.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
const wasmPath = process.argv[2];
if (!wasmPath || process.argv.length !== 3) throw new Error("ExpectedOneWasmPath");
const wasm = readFileSync(wasmPath);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const wasmSha256 = digest(wasm);
const paths = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx") && !path.endsWith("/password-12345.hwpx"));
if (!paths.length) throw new Error("EmptyFixtureInventory");
console.log(JSON.stringify({ kind: "start", files: paths.length, wasmSha256, scope: "one eligible plain host per fixture; table stage and host prefix history; not independent XML or browser" }));
const editor = await createHwpxEditor(wasm), counts = {};
try {
  for (const path of paths) {
    const input = readFileSync(path), result = { kind: "file", path, inputSha256: digest(input) };
    try {
      const { sectionCount } = editor.open(input);
      editor.enableHistory();
      const resources = Object.fromEntries(Object.entries(editor.tableCreationResources()).map(([key, ids]) => [key, ids[0]]));
      let host;
      for (let section = 0; section < sectionCount && !host; section++) {
        if (!editor.createdTableHostMode(section)) continue;
        for (const paragraph of editor.paragraphTextSnapshot(section)) {
          if (!paragraph.nested && editor.canEdit(section, paragraph.paragraph)) { host = { section, paragraph: paragraph.paragraph }; break; }
        }
      }
      if (!host) result.status = "no_eligible_host";
      else {
        Object.assign(result, host);
        const identity = editor.insertTable(host.section, host.paragraph, 0, { rows: 1, columns: 1, width: 100, rowHeight: 17, resources });
        const before = editor.save();
        editor.splice(host.section, host.paragraph, 0, 0, "앞😀<&");
        const table = editor.createdTables(host.section).find(row => row.identity === identity);
        assert.equal(table.anchor_unit, 5);
        const after = editor.save();
        assert.equal(editor.undo(), true); assert.deepEqual(editor.save(), before);
        assert.equal(editor.redo(), true); assert.deepEqual(editor.save(), after);
        editor.open(after); assert.deepEqual(editor.save(), after);
        result.status = "passed";
      }
    } catch (error) { result.status = "failed"; result.error = error.message; process.exitCode = 1; }
    assert.equal(digest(readFileSync(path)), result.inputSha256);
    assert.equal(digest(readFileSync(wasmPath)), wasmSha256);
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    console.log(JSON.stringify(result));
  }
} finally { editor.close(); }
console.log(JSON.stringify({ kind: "summary", files: paths.length, counts, wasmSha256 }));
