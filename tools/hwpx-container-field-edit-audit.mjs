// Every field-owned prefix in one explicit single-closed-field-per-section file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { createHwpxReader } from "../js/hwpx.mjs";
import { parseEditAuditOptions } from "./hwpx-edit-audit-options.mjs";
import { captureInputIdentity, verifyInputIdentity } from "./audit-input-identity.mjs";
import { hwpxParagraphCoordinates } from "./hwpx-paragraph-coordinates.mjs";
import { queryPrefixRoute } from "./hwpx-prefix-route-query.mjs";
import { insertPrefix } from "./hwpx-prefix-edit-probe.mjs";
import { execFileSync } from "./oracle-process.mjs";

const options = parseEditAuditOptions(process.argv.slice(2), { requireWasm: true });
if (!options.fixture) throw new Error("MissingAuditFixture");
const input = readFileSync(options.fixture), wasm = readFileSync(options.wasm);
const inputSha256 = captureInputIdentity(input), wasmSha256 = captureInputIdentity(wasm);
const oraclePath = "tools/hwpx-container-field-prefix-oracle.py";
const oracleBytes = readFileSync(oraclePath), oracleSha256 = captureInputIdentity(oracleBytes);
const before = input.toString("base64");
const fields = JSON.parse(execFileSync("python3", ["-c", String.raw`
import base64,io,json,re,sys,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin);P='{http://www.hancom.co.kr/hwpml/2011/paragraph}';out={}
with zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))) as z:
 for name in z.namelist():
  m=re.fullmatch(r'Contents/section([0-9]+)\.xml',name)
  if not m:continue
  root=E.fromstring(z.read(name));b=list(root.iter(P+'fieldBegin'));e=list(root.iter(P+'fieldEnd'))
  if not b and not e:continue
  if len(b)!=1 or len(e)!=1 or b[0].get('type') not in ('CLICK_HERE','HYPERLINK') or e[0].get('beginIDRef')!=b[0].get('id'):raise ValueError('SingleClosedTextFieldRequired')
  out[m[1]]=b[0].get('id')
print(json.dumps(out))
`], { input: JSON.stringify({ before }), encoding: "utf8", timeout: 30000 }));
const module = await WebAssembly.compile(wasm);
const editor = await createHwpxEditor(module), reader = await createHwpxReader(module);
const totals = { paragraphs: 0, attempts: 0, verified: 0, skipped: {}, negativeControls: 0, failures: [] };
const text = "전수😀<&";
const paragraphText = (projection, p) => projection.events.filter(e => e.kind === "content" && e.section === p.section && e.paragraph === p.paragraph).map(e => e.value).join("");
const restore = () => { editor.open(input); editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 }); };
console.log(JSON.stringify({ kind: "start", path: options.fixture, inputSha256, wasmSha256, oracleSha256, scope: "all field-owned prefixes; full XML/ZIP history reopen; other routes not edited" }));
try {
  restore();
  const original = reader.readTextEvents(input);
  for (const p of hwpxParagraphCoordinates(original.events)) {
    totals.paragraphs++;
    verifyInputIdentity(oracleBytes, oracleSha256, oraclePath);
    let phase = "query";
    try {
      const revision = editor.historyRevision();
      const route = queryPrefixRoute(editor, p.section, p.paragraph);
      assert.equal(editor.historyRevision(), revision);
      if (route !== "field") { totals.skipped[route] = (totals.skipped[route] ?? 0) + 1; continue; }
      totals.attempts++;
      assert.equal(typeof fields[p.section], "string", "independent source field ID required");
      phase = "edit";
      insertPrefix(editor, p.section, p.paragraph, text);
      const saved = Buffer.from(editor.save());
      phase = "oracle";
      const payload = { before, after: saved.toString("base64"), section: p.section, paragraph: p.localParagraph, beginId: fields[p.section], text };
      for (const flags of [[], ["-O"]]) {
        const check = data => execFileSync("python3", [...flags, oraclePath], { input: JSON.stringify(data), timeout: 30000 });
        check(payload);
        if (totals.verified === 0) {
          assert.throws(() => check({ ...payload, text: "wrong" }), e => e.status === 1 && e.signal === null && /complete XML mismatch/.test(String(e.stderr)));
          totals.negativeControls++;
        }
      }
      verifyInputIdentity(oracleBytes, oracleSha256, oraclePath);
      phase = "projection";
      assert.equal(paragraphText(reader.readTextEvents(saved), p), text + paragraphText(original, p));
      phase = "reopen";
      const reopened = await createHwpxEditor(module);
      try { reopened.open(saved); assert.deepEqual(Buffer.from(reopened.save()), saved); } finally { reopened.close(); }
      phase = "history";
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      totals.verified++;
      if (totals.verified % 50 === 0) console.log(JSON.stringify({ kind: "progress", path: options.fixture, verified: totals.verified, failures: totals.failures.length }));
    } catch (error) {
      const failure = { ...p, phase, error: error.message, ...(error.stderr ? { stderr: String(error.stderr).slice(-1000) } : {}) };
      totals.failures.push(failure);
      console.log(JSON.stringify({ kind: "failure", ...failure }));
      restore();
    }
  }
  assert.equal(totals.paragraphs, totals.verified + totals.failures.length + Object.values(totals.skipped).reduce((a, b) => a + b, 0));
  assert.deepEqual(Buffer.from(editor.save()), input);
  verifyInputIdentity(input, inputSha256, options.fixture);
  verifyInputIdentity(wasm, wasmSha256, options.wasm);
  verifyInputIdentity(oracleBytes, oracleSha256, oraclePath);
  assert(totals.verified > 0, "positive field edit control required");
  console.log(JSON.stringify({ kind: "summary", path: options.fixture, totals, inputSha256, wasmSha256, oracleSha256 }));
  if (totals.failures.length) process.exitCode = 1;
} finally { editor.close(); reader.close(); }
