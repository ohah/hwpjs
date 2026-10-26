import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { closeOwnedBrowser } from "./browser/session-close.mjs";
const origin = process.argv[2] ?? "http://127.0.0.1:49008";
const dir = resolve(
    process.env.HWPJS_SEARCH_OUTPUT ??
      "zig-out/verification/editor-search-direction/" +
        new Date().toISOString().replace(/[:.]/g, "-"),
  ),
  download = resolve(dir, "downloads");
mkdirSync(download, { recursive: true });
const session = execFileSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "search-direction"],
  { encoding: "utf8" },
).trim();
const cmd = (...args) => {
  const r = JSON.parse(
    execFileSync(
      "agent-browser",
      [
        "--session",
        session,
        "--init-script",
        resolve("tools/browser/demo-edit-observer.js"),
        "--download-path",
        download,
        "--json",
        ...args,
      ],
      { encoding: "utf8", timeout: 45000, maxBuffer: 5e6 },
    ),
  );
  assert.equal(r.success, true, JSON.stringify(r));
  return r.data;
};
const ev = (s) => cmd("eval", s).result,
  wait = (s) => cmd("wait", "--fn", s),
  click = (s) => cmd("click", s),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const hits = [
  ["밑줄없음밑줄가운데줄윗줄", 0, 2],
  ["밑줄없음밑줄가운데줄윗줄", 4, 6],
  ["붉은밑줄", 2, 4],
  ["점선밑줄", 2, 4],
];
const selected = () =>
  ev(
    '(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return [i.value,i.selectionStart,i.selectionEnd]})()',
  );
const next = (hit) => {
  click("[data-role=find-next]");
  wait(
    `(()=>{const i=document.querySelector('textarea[data-hwpjs-document-input]');return i.value===${JSON.stringify(hit[0])}&&i.selectionStart===${hit[1]}&&i.selectionEnd===${hit[2]}})()`,
  );
  assert.deepEqual(selected(), hit);
};
const results = [];
assert.equal(cmd("session", "info").active, false);
try {
  for (const framework of ["vanilla", "react", "svelte"])
    for (const format of ["hwp", "hwpx"]) {
      cmd("open", `${origin}/demo/${framework}`);
      wait('document.querySelector("[data-role=file-picker]")?.disabled===false');
      const path = resolve(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format}`),
        source = readFileSync(path);
      cmd("upload", "[data-role=file-picker]", path);
      wait('document.body.innerText.includes("문서를 열었습니다.")');
      const modifier = /Mac|iPhone|iPad/.test(ev("navigator.platform")) ? "Meta" : "Control";
      cmd("focus", "canvas");
      cmd("press", modifier + "+f");
      wait('!!document.querySelector("dialog[data-role=text-search][open]")');
      cmd("fill", "[data-role=search-query]", "밑줄");
      assert.equal(ev('document.querySelector("[data-role=search-direction-down]").checked'), true);
      for (const hit of hits) next(hit);
      const before = selected();
      click("[data-role=find-next]");
      wait('document.querySelector("[data-role=continue-search]").hidden===false');
      assert.deepEqual(selected(), before);
      assert(
        ev('document.querySelector("[data-role=search-status]").innerText').includes("앞부분"),
      );
      click("[data-role=continue-search]");
      wait('document.querySelector("[data-role=continue-search]").hidden===true');
      assert.deepEqual(selected(), hits[0]);
      click("[data-role=search-direction-up]");
      click("[data-role=find-next]");
      wait('document.querySelector("[data-role=continue-search]").hidden===false');
      assert.deepEqual(selected(), hits[0]);
      click("[data-role=continue-search]");
      wait('document.querySelector("[data-role=continue-search]").hidden===true');
      assert.deepEqual(selected(), hits[3]);
      for (const hit of [...hits].reverse().slice(1)) next(hit);
      click("[data-role=search-direction-all]");
      for (const hit of [...hits.slice(1), hits[0]]) {
        next(hit);
        assert.equal(ev('document.querySelector("[data-role=continue-search]").hidden'), true);
      }
      assert.equal(
        ev(
          'window.__demoEditAudit.requests.filter(r=>["splice","character-properties","undo","redo"].includes(r.kind)).length',
        ),
        0,
      );
      cmd("screenshot", resolve(dir, `${framework}-${format}.png`));
      cmd("press", "Escape");
      wait('!document.querySelector("dialog[data-role=text-search]")');
      const stamp = (p) => {
          const s = statSync(p, { bigint: true });
          return `${s.mtimeNs}:${s.ctimeNs}:${s.ino}`;
        },
        prior = new Map(readdirSync(download).map((n) => [n, stamp(resolve(download, n))]));
      cmd("focus", "canvas");
      cmd("press", modifier + "+s");
      wait("window.__demoEditAudit.saves.length===1");
      assert.equal(ev('window.__demoEditAudit.requests.filter(r=>r.kind==="save").length'), 1);
      const saved = Buffer.from(ev("window.__demoEditAudit.saves[0].base64"), "base64");
      assert.deepEqual(saved, source, "ReadOnlySearchChangedSourceBytes");
      let downloaded;
      for (let i = 0; i < 60 && !downloaded; i++) {
        downloaded = readdirSync(download)
          .filter(
            (n) =>
              !n.endsWith(".crdownload") &&
              (!prior.has(n) || prior.get(n) !== stamp(resolve(download, n))),
          )
          .map((n) => resolve(download, n))
          .find((p) => hash(readFileSync(p)) === hash(saved));
        if (!downloaded) await pause(100);
      }
      assert(downloaded, "ActualBrowserDownloadMissing");
      results.push({
        framework,
        format,
        forward: true,
        backward: true,
        boundaryConsent: true,
        wholeDocumentWrap: true,
        escapeCloses: true,
        mutations: 0,
        savedOriginalBytes: true,
        downloaded,
        sha256: hash(source),
      });
      writeFileSync(resolve(dir, "results.json"), JSON.stringify(results, null, 2));
    }
  console.log(JSON.stringify({ pass: results.length, output: dir }));
} catch (error) {
  try {
    writeFileSync(
      resolve(dir, "failure.json"),
      JSON.stringify(
        { error: String(error), snapshot: cmd("snapshot"), errors: cmd("errors"), results },
        null,
        2,
      ),
    );
    cmd("screenshot", resolve(dir, "failure.png"));
  } catch {}
  throw error;
} finally {
  await closeOwnedBrowser(cmd);
  writeFileSync(
    resolve(dir, "cleanup.json"),
    JSON.stringify({ session, inactive: cmd("session", "info").active === false }),
  );
}
