// Actual Chromium input and independent ZIP/XML; never a replacement for corpus coverage.
import assert from "node:assert/strict";
import { spawn, execFileSync as cli } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync as oracle } from "../oracle-process.mjs";
import { clickBrowserTarget } from "./click-target.mjs";
import { moveBrowserInputToStart } from "./input-origin.mjs";
import { closeOwnedBrowser } from "./session-close.mjs";
import { writeAuditRow } from "../audit-jsonl-output.mjs";

import { fieldLabelBrowserCases } from "./field-label-cases.mjs";

export async function runFieldLabelBrowserAudit(caseName) {
  assert(Object.hasOwn(fieldLabelBrowserCases, caseName), "UnknownFieldLabelBrowserCase");
  const config = fieldLabelBrowserCases[caseName];
  assert(process.env.HWPJS_TEST_WASM, "ExplicitBrowserCandidateRequired");
  if (process.argv.length !== 2) throw Error("UnexpectedBrowserAuditArguments");
  const root = resolve("."),
    { port, section, paragraph, marker, fixturePath, oraclePath, oracleParagraph, beginId } =
      config;
  const session = cli(
    "agent-browser",
    ["session", "id", "--scope", "worktree", "--prefix", config.sessionPrefix],
    { cwd: root, encoding: "utf8", timeout: 10000 },
  ).trim();
  assert(/^[a-zA-Z0-9_-]+$/.test(session));
  const wasmPath = resolve(process.env.HWPJS_TEST_WASM),
    wasm = readFileSync(wasmPath);
  const fixture = resolve(fixturePath),
    input = readFileSync(fixture);
  const output = mkdtempSync(join(tmpdir(), config.outputPrefix));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const editor = await createHwpxEditor(wasm);
  let original;
  try {
    editor.open(input);
    assert.equal(editor.fieldLabels(section, paragraph + 1).length, 1);
    original = editor.fieldLabelDisplayText(section, paragraph + 1);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally {
    editor.close();
  }
  const command = (...args) => {
    const result = JSON.parse(
      cli("agent-browser", ["--json", "--session", session, ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "55000" },
      }),
    );
    if (result.success !== true) throw Error(JSON.stringify(result.error ?? result));
    return result.data;
  };
  const evaluate = (expression) => {
    const value = command("eval", expression);
    assert(value && Object.hasOwn(value, "result"));
    return value.result;
  };
  const driver = { command, evaluate },
    click = (selector) => clickBrowserTarget(driver, selector);
  const wait = (expression) => command("wait", "--fn", expression);
  let lastPhase = "preflight";
  const phase = (name) => {
    lastPhase = name;
    writeAuditRow({ kind: config.phaseKind, name, session, output });
  };
  const selectWindow = (expected) => {
    if (!evaluate('document.querySelector("#document-window-options").open'))
      click("#document-window-options > summary");
    command("fill", "#document-window-start", String(paragraph + 1));
    command("fill", "#document-window-count", "1");
    evaluate("window.__fieldLabelAudit = []");
    click("#document-window-apply");
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "set-edit-window" && !r.error)',
    );
    assert.equal(
      evaluate(
        'window.__fieldLabelAudit.find(r => r.direction === "reply" && r.kind === "set-edit-window").text',
      ),
      expected,
    );
    assert.equal(
      evaluate(
        'window.__fieldLabelAudit.find(r => r.direction === "reply" && r.kind === "set-edit-window").labels',
      ),
      1,
    );
  };
  const find = (text) => {
    if (!evaluate('document.querySelector("details:has(#find-input)").open'))
      click("details:has(#find-input) > summary");
    command("fill", "#find-input", text);
    click('#find-form button[type="submit"]');
    wait(
      '!document.querySelector("#canvas-input").disabled && !document.querySelector("#canvas-input").readOnly',
    );
    assert.equal(evaluate('document.querySelector("#canvas-input").value'), text);
  };
  let server,
    owned = false,
    closed = false,
    verified = false;
  try {
    assert.equal(command("session", "info").active, false, "RefuseActiveSession");
    server = spawn(process.execPath, [resolve("tools/serve-preview.mjs"), String(port), wasmPath], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(Error("ServerStartTimeout")), 10000);
      server.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      server.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error(`ServerExited:${code}`));
      });
      server.stdout.once("data", (bytes) => {
        clearTimeout(timer);
        if (String(bytes).includes(`127.0.0.1:${port}/web/preview/index.html`)) accept();
        else reject(Error("UnexpectedServer"));
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/zig-out/bin/hwpjs.wasm`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(wasm), "ServedWasmMismatch");
    owned = true;
    command("open", `http://127.0.0.1:${port}/web/preview/index.html`);
    command("snapshot", "-i");
    evaluate(`(() => {
      window.__fieldLabelAudit = []; const watched = new WeakSet(), post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...rest) {
        if (!watched.has(this)) { watched.add(this); this.addEventListener("message", event => {
          const row = event.data, owner = row.content?.paragraphs.find(p => p.section === ${section} && p.paragraph === ${paragraph});
          window.__fieldLabelAudit.push({direction:"reply",kind:row.kind,error:row.error,changed:row.changed,revision:row.historyRevision,text:owner?.text,labels:owner?.fieldLabels?.length});
        }); }
        window.__fieldLabelAudit.push({direction:"request",kind:message.kind,section:message.section,paragraph:message.paragraph,startUnit:message.startUnit,endUnit:message.endUnit});
        return post.call(this,message,...rest);
      };
    })()`);
    wait('!document.querySelector("#file").disabled');
    command("upload", "#file", fixture);
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "load" && !r.error)',
    );
    phase("loaded");
    click("#enable-edit");
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "enable" && r.revision === 0 && !r.error)',
    );
    selectWindow(original);
    find(original);
    phase("field-selected");
    evaluate(
      'window.__fieldLabelTrusted = []; for (const type of ["beforeinput","input"]) document.querySelector("#canvas-input").addEventListener(type,event => window.__fieldLabelTrusted.push({type,trusted:event.isTrusted}))',
    );
    moveBrowserInputToStart(driver);
    command("keyboard", "inserttext", marker);
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "splice" && r.revision === 1 && !r.error)',
    );
    assert.deepEqual(
      evaluate("window.__fieldLabelTrusted.filter(r => r.trusted).map(r => r.type)"),
      ["beforeinput", "input"],
    );
    const sent = evaluate(
      'window.__fieldLabelAudit.find(r => r.direction === "request" && r.kind === "splice")',
    );
    assert.deepEqual(
      [sent.section, sent.paragraph, sent.startUnit, sent.endUnit],
      [section, paragraph, 0, 0],
    );
    assert.equal(evaluate('document.querySelector("#canvas-input").value'), marker + original);
    command("scrollintoview", "#canvas-input");
    command("screenshot", join(output, "edited.png"));
    phase("trusted-input");
    click("#undo");
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "undo" && r.changed && r.revision === 0)',
    );
    assert.equal(evaluate('document.querySelector("#canvas-input").value'), original);
    phase("undo-complete");
    click("#redo");
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "redo" && r.changed && r.revision === 1)',
    );
    assert.equal(evaluate('document.querySelector("#canvas-input").value'), marker + original);
    phase("redo-complete");
    command("scrollintoview", "#download");
    const downloaded = join(output, "edited.hwpx");
    command("download", "#download", downloaded);
    const saved = readFileSync(downloaded);
    const request = {
      before: input.toString("base64"),
      after: saved.toString("base64"),
      section,
      paragraph: oracleParagraph,
      beginId,
      text: marker,
    };
    for (const flags of [[], ["-O"]])
      oracle("python3", [...flags, oraclePath], { input: JSON.stringify(request), timeout: 30000 });
    phase("independent-download");
    evaluate("window.__fieldLabelAudit = []");
    command("upload", "#file", downloaded);
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "load" && !r.error)',
    );
    click("#enable-edit");
    wait(
      'window.__fieldLabelAudit.some(r => r.direction === "reply" && r.kind === "enable" && r.revision === 0 && !r.error)',
    );
    selectWindow(marker + original);
    find(marker + original);
    command("scrollintoview", "#canvas-input");
    command("screenshot", join(output, "reuploaded.png"));
    assert.equal(hash(readFileSync(fixture)), hash(input));
    verified = true;
    writeAuditRow({
      kind: config.resultKind,
      verified,
      output,
      wasmSha256: hash(wasm),
      inputSha256: hash(input),
      savedSha256: hash(saved),
      scope: config.scope,
    });
  } catch (error) {
    let observations = null,
      observationError = null,
      sessionInfo = null;
    try {
      observations = evaluate("window.__fieldLabelAudit.slice(-12)");
    } catch (failure) {
      observationError = failure.message;
    }
    try {
      sessionInfo = command("session", "info");
    } catch (failure) {
      observationError ??= failure.message;
    }
    writeAuditRow({
      kind: "field-label-browser-failure",
      caseName,
      lastPhase,
      error: error.message,
      observations,
      observationError,
      sessionInfo,
    });
    throw error;
  } finally {
    try {
      if (owned) {
        await closeOwnedBrowser(command);
        closed = true;
      }
    } finally {
      if (server?.pid && server.exitCode === null && server.signalCode === null) {
        const ended = once(server, "exit"),
          timer = setTimeout(() => server.kill("SIGKILL"), 3000);
        server.kill("SIGTERM");
        try {
          await ended;
        } finally {
          clearTimeout(timer);
        }
      }
      const serverExited = !server?.pid || server.exitCode !== null || server.signalCode !== null;
      writeAuditRow({
        kind: config.cleanupKind,
        session,
        browserClosed: closed,
        serverExited,
        success: verified && closed && serverExited,
      });
    }
  }
}
