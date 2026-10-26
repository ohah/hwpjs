import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachHwpxPageAreaDeclarations } from "../../web/preview/hwpx-page-area-declarations.mjs";
import { trackedHwpxFiles } from "../../tools/hwpx-corpus-files.mjs";

test("declaration attachment queries once per section and reports failures without stale coordinates", () => {
  let calls = 0;
  const content = {
    paragraphFlows: [
      { section: 0, page_area: {} },
      { section: 0, page_area: {} },
      { section: 1, page_area: {} },
    ],
  };
  const editor = {
    pageAreaDeclarations(section) {
      calls++;
      if (section === 1) throw Error("SourceBindingMismatch");
      return [{ paragraph: 2, sourceElement: 7, sourceControl: 6, unit: 0, affinity: "left" }];
    },
  };
  assert.equal(attachHwpxPageAreaDeclarations(editor, content, true), content);
  assert.equal(calls, 2);
  assert.equal(content.pageAreaDeclarations[0].paragraph, 1);
  assert.deepEqual(content.pageAreaDeclarationErrors, [
    { section: 1, error: "SourceBindingMismatch" },
  ]);
  const next = { paragraphFlows: [] };
  attachHwpxPageAreaDeclarations(editor, next, true);
  assert.deepEqual(next.pageAreaDeclarations, []);
  assert.equal(calls, 2);
  const old = { paragraphFlows: content.paragraphFlows };
  attachHwpxPageAreaDeclarations(editor, old, false);
  assert.equal(Object.hasOwn(old, "pageAreaDeclarations"), false);
});

test("declaration attachment replaces reused response coordinates and clears previous errors", () => {
  const content = { paragraphFlows: [{ section: 2, page_area: {} }] };
  let paragraph = 9;
  let failed = false;
  const source = { paragraph, unit: 3, affinity: "right", sourceElement: 17 };
  const editor = {
    pageAreaDeclarations(section) {
      assert.equal(section, 2);
      if (failed) throw Error("SourceBindingMismatch");
      return [{ ...source, paragraph }];
    },
  };
  attachHwpxPageAreaDeclarations(editor, content, true);
  const first = content.pageAreaDeclarations;
  paragraph = 12;
  attachHwpxPageAreaDeclarations(editor, content, true);
  assert.equal(first[0].paragraph, 8);
  assert.equal(content.pageAreaDeclarations[0].paragraph, 11);
  assert.equal(source.paragraph, 9);
  assert.equal(content.pageAreaDeclarations[0].unit, 3);
  assert.equal(content.pageAreaDeclarations[0].affinity, "right");
  failed = true;
  attachHwpxPageAreaDeclarations(editor, content, true);
  assert.deepEqual(content.pageAreaDeclarations, []);
  assert.deepEqual(content.pageAreaDeclarationErrors, [
    { section: 2, error: "SourceBindingMismatch" },
  ]);
  failed = false;
  attachHwpxPageAreaDeclarations(editor, content, true);
  assert.deepEqual(content.pageAreaDeclarationErrors, []);
  assert.equal(content.pageAreaDeclarations[0].paragraph, 11);
});

test(
  "actual Worker declarations preserve tracked loads and refresh after split history and reopen",
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
      exports = WebAssembly.Module.exports;
    assert.ok(
      exports(new WebAssembly.Module(wasm)).some(
        (row) => row.name === "hwpx_edit_page_area_declarations",
      ),
    );
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    let legacy = false;
    WebAssembly.Module.exports = (module) =>
      exports(module).filter((row) => !legacy || row.name !== "hwpx_edit_page_area_declarations");
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      WebAssembly.Module.exports = exports;
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import("../../web/preview/reader-worker.mjs?area-declaration=" + Date.now());
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      return replies.shift();
    };
    try {
      let loaded = 0,
        refused = 0;
      for (const path of trackedHwpxFiles()) {
        const bytes = readFileSync(path);
        legacy = true;
        const old = await send({ kind: "load", format: "hwpx", bytes });
        legacy = false;
        const current = await send({ kind: "load", format: "hwpx", bytes });
        assert.equal(current.error, old.error, path);
        if (current.error) {
          assert.equal(current.error, "EncryptedDocument");
          refused++;
          continue;
        }
        const { pageAreaDeclarations, pageAreaDeclarationErrors, ...body } = current.content;
        assert.deepEqual(body, old.content, path);
        assert.ok(Array.isArray(pageAreaDeclarations));
        assert.deepEqual(pageAreaDeclarationErrors, [], path);
        loaded++;
      }
      t.diagnostic(JSON.stringify({ loaded, refused }));
      const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx");
      let reply = await send({ kind: "load", format: "hwpx", bytes: input });
      assert.equal(reply.error, undefined);
      const before = reply.content.pageAreaDeclarations;
      reply = await send({ kind: "enable" });
      assert.equal(reply.error, undefined);
      const split = await send({
        kind: "split",
        origin: "canvas",
        section: 0,
        paragraph: 0,
        atUnit: 0,
        deletedUnits: 0,
      });
      assert.equal(split.error, undefined);
      const changed = split.content.pageAreaDeclarations;
      assert.deepEqual(
        changed.map((row) => row.paragraph),
        before.map((row) => row.paragraph + 1),
      );
      assert.deepEqual((await send({ kind: "undo" })).content.pageAreaDeclarations, before);
      assert.deepEqual((await send({ kind: "redo" })).content.pageAreaDeclarations, changed);
      const saved = await send({ kind: "save" });
      assert.equal(saved.error, undefined);
      const reopened = await send({ kind: "load", format: "hwpx", bytes: saved.bytes });
      assert.equal(reopened.error, undefined);
      assert.deepEqual(
        reopened.content.pageAreaDeclarations.map(({ section, paragraph, unit, affinity }) => ({
          section,
          paragraph,
          unit,
          affinity,
        })),
        changed.map(({ section, paragraph, unit, affinity }) => ({
          section,
          paragraph,
          unit,
          affinity,
        })),
      );
      assert.deepEqual(
        before.map((row) => row.paragraph),
        [1, 1],
      );
    } finally {
      await send({ kind: "load", format: "close-audit", bytes: [] });
    }
  },
);
