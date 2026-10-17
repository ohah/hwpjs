// One real-browser reference roundtrip. Uses the CLI, not a second browser driver.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { clickBrowserTarget } from "./browser/click-target.mjs";
import { closeOwnedBrowser } from "./browser/session-close.mjs";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { inspect, verifyRaw } from "../tests/hwp5/style-preservation/text-record-oracle.mjs";

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(root|port|paragraph|occurrence)=(.+)$/.exec(argument);
  if (!match || options[match[1]] !== undefined) throw Error("InvalidBrowserAuditArgument");
  options[match[1]] = match[2];
}
const root = resolve(options.root ?? dirname(dirname(fileURLToPath(import.meta.url))));
const port = Number(options.port ?? 58851);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error("InvalidBrowserAuditPort");
const marker = "브라우저검증😀", section = 2, paragraph = Number(options.paragraph ?? 1), occurrence = Number(options.occurrence ?? 3);
if (!Number.isSafeInteger(paragraph) || paragraph < 0 || !Number.isSafeInteger(occurrence) || occurrence < 1 || occurrence > 100) throw Error("InvalidBrowserAuditSelection");
assert(process.env.HWPJS_TEST_WASM, "Explicit browser candidate required");
const wasmPath = resolve(process.env.HWPJS_TEST_WASM), wasm = readFileSync(wasmPath);
const fixture = resolve(root, "reference/rhwp/samples/hwpspec.hwp"), input = readFileSync(fixture);
const output = mkdtempSync(join(tmpdir(), "hwpjs-reference-browser-"));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const baselineEditor = await createExperimentalHwp5Editor(wasm, input, { distribution: true, normalizeObservedCfb: true });
let baseline, original;
try {
  assert.equal(baselineEditor.normalizationInfo().normalized, true);
  baseline = baselineEditor.save().bytes;
  original = baselineEditor.text(section, paragraph);
} finally { baselineEditor.close(); }
const displayOriginal = original.replace(/\r$/, "");
const session = execFileSync("agent-browser", ["session", "id", "--scope", "worktree", "--prefix", "hwpjs-reference-roundtrip"], { cwd: root, encoding: "utf8", timeout: 10000 }).trim();
assert(/^[a-zA-Z0-9_-]+$/.test(session));
const command = (...args) => {
  const result = JSON.parse(execFileSync("agent-browser", ["--json", "--session", session, ...args], { cwd: root, encoding: "utf8", timeout: 35000, maxBuffer: 4 * 1024 * 1024 }));
  if (result.success !== true) throw Error(JSON.stringify(result.error ?? result));
  return result.data;
};
const evaluate = expression => {
  const result = command("eval", expression);
  if (!result || !Object.hasOwn(result, "result")) throw Error("InvalidBrowserEvalResponse");
  return result.result;
};
const driver = { command, evaluate, afterClick(selector) { if (selector === "#enable-edit") command("dialog", "accept"); } };
const click = selector => clickBrowserTarget(driver, selector);
const wait = expression => command("wait", "--fn", expression);
const snapshot = label => {
  if (evaluate('!document.querySelector("#canvas-input").disabled && document.querySelector("#canvas-input").getBoundingClientRect().width > 0')) command("scrollintoview", "#canvas-input");
  command("screenshot", join(output, label + ".png"));
};
const phase = name => console.log(JSON.stringify({ kind: "browser-phase", name, session, output }));
let server, ownedBrowser = false, browserClosed = false, roundtripVerified = false;
try {
  assert.equal(command("session", "info").active, false, "Refuse to take over an active session");
  server = spawn(process.execPath, [resolve(root, "tools/serve-preview.mjs"), String(port), wasmPath], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(Error("BrowserAuditServerStartTimeout")), 10000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(Error(`BrowserAuditServerExited:${code}`)); });
    server.stdout.once("data", bytes => { clearTimeout(timer); String(bytes).includes(`127.0.0.1:${port}/web/preview/index.html`) ? accept() : reject(Error("UnexpectedBrowserAuditServer")); });
  });
  ownedBrowser = true;
  command("open", `http://127.0.0.1:${port}/web/preview/index.html`);
  command("snapshot", "-i");
  evaluate(`(() => {
    window.__hwpAudit = [];
    const watched = new WeakSet(), post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (!watched.has(this)) {
        watched.add(this);
        this.addEventListener("message", event => {
          const row = event.data, owner = row.content?.paragraphs.find(p => p.section === ${section} && p.paragraph === ${paragraph});
          window.__hwpAudit.push({ direction: "reply", kind: row.kind, origin: row.origin, error: row.error, changed: row.changed, revision: row.historyRevision, text: owner?.text });
        });
      }
      window.__hwpAudit.push({ direction: "request", kind: message.kind, origin: message.origin, section: message.section, paragraph: message.paragraph });
      return post.call(this, message, ...rest);
    };
  })()`);
  wait('!document.querySelector("#file").disabled');
  command("upload", "#file", fixture);
  wait('window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "load")');
  click("#enable-edit");
  wait('window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "enable" && r.revision === 0)');
  click("details:has(#find-input) > summary");
  command("fill", "#find-input", displayOriginal);
  for (let index = 0; index < occurrence; index++) click('#find-form button[type="submit"]');
  assert.equal(evaluate('document.querySelector("#canvas-input").value'), displayOriginal);
  command("press", "Home"); command("keyboard", "inserttext", marker);
  wait('window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "splice" && r.revision === 1)');
  assert.equal(evaluate('window.__hwpAudit.find(r => r.direction === "request" && r.kind === "splice").section'), section);
  assert.equal(evaluate('window.__hwpAudit.find(r => r.direction === "request" && r.kind === "splice").paragraph'), paragraph);
  assert.equal(evaluate('document.querySelector("#canvas-input").value'), marker + displayOriginal);
  snapshot("edited"); phase("input-verified");
  click("#undo");
  wait('window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "undo" && r.changed && r.revision === 0)');
  assert.equal(evaluate('document.querySelector("#canvas-input").value'), displayOriginal);
  snapshot("undone");
  click("#redo");
  wait('window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "redo" && r.changed && r.revision === 1)');
  assert.equal(evaluate('document.querySelector("#canvas-input").value'), marker + displayOriginal);
  click("#allow-stale-layout");
  assert.equal(evaluate('document.querySelector("#allow-stale-layout").checked'), true);
  command("scrollintoview", "#download");
  const downloaded = join(output, "edited.hwp");
  command("download", "#download", downloaded);
  const saved = readFileSync(downloaded);
  verifyRaw(baseline, saved, section, paragraph, 0, 0, marker, { fieldIds: [0x25787266] });
  assert.throws(() => verifyRaw(baseline, saved, section, paragraph, 0, 0, marker.replace("검증", "검진"), { fieldIds: [0x25787266] }), assert.AssertionError);
  assert.deepEqual(inspect(saved).metadata, inspect(baseline).metadata);
  const reopened = await createExperimentalHwp5Editor(wasm, saved, { distribution: true });
  try { assert.equal(reopened.text(section, paragraph), marker + original); } finally { reopened.close(); }
  phase("independent-download-verified");
  command("upload", "#file", downloaded);
  wait(`window.__hwpAudit.some(r => r.direction === "reply" && r.kind === "load" && r.text === ${JSON.stringify(marker + displayOriginal)})`);
  snapshot("reuploaded");
  assert.equal(digest(readFileSync(fixture)), digest(input));
  roundtripVerified = true;
  console.log(JSON.stringify({ kind: "browser-roundtrip", verified: true, wasmSha256: digest(wasm), inputSha256: digest(input), savedSha256: digest(saved), section, paragraph, output, scope: "one reference, trusted targeted clicks, real input/history/download/reupload and independent full Section/streams/metadata" }));
} finally {
  try {
    if (ownedBrowser) { await closeOwnedBrowser(command); browserClosed = true; }
  } finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
      server.kill("SIGTERM");
      try { await exited; } finally { clearTimeout(timer); }
    }
    const serverExited = !server?.pid || server.exitCode !== null || server.signalCode !== null;
    console.log(JSON.stringify({ kind: "browser-cleanup", session, browserClosed, serverExited }));
    console.log(JSON.stringify({ kind: "browser-audit-complete", success: roundtripVerified && browserClosed && serverExited }));
  }
}
