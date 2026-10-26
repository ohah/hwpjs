import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFormulaResultDisplayLookup } from "../../web/preview/formula-result-display-lookup.mjs";
import { trackedHwpxFiles } from "../../tools/hwpx-corpus-files.mjs";
const names = new Set(["hwpx_edit_manual_formula_result_display_snapshot"]);

test("display lookup is request-local and only aggregate limit errors use old bounded queries", () => {
  let calls = 0,
    text = "before";
  const editor = {
    manualFormulaResultDisplaySnapshot: () => {
      calls++;
      return [{ paragraph: 1, text, targets: [] }];
    },
  };
  const first = createFormulaResultDisplayLookup(editor, names);
  assert.equal(first.get(0, 1).text, "before");
  assert.equal(first.get(0, 2), null);
  assert.equal(calls, 1);
  text = "after";
  assert.equal(createFormulaResultDisplayLookup(editor, names).get(0, 1).text, "after");
  assert.equal(calls, 2);
  assert.equal(first.get(0, 1).text, "before");
  let limited = 0;
  const fallback = createFormulaResultDisplayLookup(
    {
      manualFormulaResultDisplaySnapshot() {
        limited++;
        throw Error("LimitExceeded");
      },
    },
    names,
  );
  assert.equal(fallback.get(0, 1), undefined);
  assert.equal(fallback.get(0, 2), undefined);
  assert.equal(limited, 1);
  const malformed = createFormulaResultDisplayLookup(
    {
      manualFormulaResultDisplaySnapshot() {
        throw Error("InvalidFieldLinks");
      },
    },
    names,
  );
  assert.throws(() => malformed.get(0, 1), /InvalidFieldLinks/);
  assert.equal(createFormulaResultDisplayLookup(editor, new Set()).available, false);
});

test("display lookup isolates sections, empty results and retryable failures", () => {
  const calls = new Map();
  let fail = true;
  const lookup = createFormulaResultDisplayLookup(
    {
      manualFormulaResultDisplaySnapshot(section) {
        calls.set(section, (calls.get(section) ?? 0) + 1);
        if (section === 2) return [];
        if (section === 3) throw Error("LimitExceeded");
        if (section === 4 && fail) throw Error("InvalidFieldLinks");
        return [{ paragraph: 1, text: String(section), targets: [] }];
      },
    },
    names,
  );
  assert.equal(lookup.get(0, 1).text, "0");
  assert.equal(lookup.get(1, 1).text, "1");
  assert.equal(lookup.get(0, 2), null);
  assert.equal(lookup.get(2, 1), null);
  assert.equal(lookup.get(2, 2), null);
  assert.equal(lookup.get(3, 1), undefined);
  assert.equal(lookup.get(3, 2), undefined);
  assert.throws(() => lookup.get(4, 1), /InvalidFieldLinks/);
  fail = false;
  assert.equal(lookup.get(4, 1).text, "4");
  assert.equal(lookup.get(1, 1).text, "1");
  assert.deepEqual(
    [...calls],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
    ],
  );
  const duplicate = createFormulaResultDisplayLookup(
    {
      manualFormulaResultDisplaySnapshot: () => [{ paragraph: 1 }, { paragraph: 1 }],
    },
    names,
  );
  assert.throws(() => duplicate.get(0, 1), /InvalidFormulaResultDisplaySnapshot/);
  const unavailable = createFormulaResultDisplayLookup({}, names);
  assert.equal(unavailable.available, false);
  assert.throws(() => unavailable.get(0, 1), /HwpxFormulaResultSnapshotAbiUnavailable/);
});

test(
  "actual Worker batch and legacy paths publish identical content and refresh after edit history",
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const originalSelf = globalThis.self,
      originalFetch = globalThis.fetch,
      originalExports = WebAssembly.Module.exports;
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
      replies = [];
    assert.ok(
      originalExports(new WebAssembly.Module(wasm)).some(
        (entry) => entry.name === "hwpx_edit_manual_formula_result_display_snapshot",
      ),
    );
    let legacy = true;
    WebAssembly.Module.exports = (module) =>
      originalExports(module).filter(
        (entry) => !legacy || entry.name !== "hwpx_edit_manual_formula_result_display_snapshot",
      );
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      WebAssembly.Module.exports = originalExports;
      globalThis.self = originalSelf;
      globalThis.fetch = originalFetch;
    });
    await import("../../web/preview/reader-worker.mjs?formula-batch=" + Date.now());
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      const reply = replies.shift();
      assert.equal(reply.error, undefined);
      return reply;
    };
    try {
      for (const path of [
        "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx",
        "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx",
      ]) {
        const input = readFileSync(path);
        legacy = true;
        const start = performance.now();
        const old = (await send({ kind: "load", format: "hwpx", bytes: input })).content;
        const legacyMs = performance.now() - start;
        legacy = false;
        const begin = performance.now();
        const current = (await send({ kind: "load", format: "hwpx", bytes: input })).content;
        const batchMs = performance.now() - begin;
        assert.deepEqual(current, old);
        const reverse = performance.now();
        const batchFirst = (await send({ kind: "load", format: "hwpx", bytes: input })).content;
        const reverseBatchMs = performance.now() - reverse;
        legacy = true;
        const reverseStart = performance.now();
        const legacySecond = (await send({ kind: "load", format: "hwpx", bytes: input })).content;
        const reverseLegacyMs = performance.now() - reverseStart;
        assert.deepEqual(batchFirst, old);
        assert.deepEqual(legacySecond, old);
        legacy = false;
        t.diagnostic(JSON.stringify({ path, legacyMs, batchMs, reverseLegacyMs, reverseBatchMs }));
        const baseline = (await send({ kind: "enable" })).content;
        const owner = baseline.paragraphs.find((p) => p.manualFormulaResults?.length > 0);
        assert.ok(owner);
        const changed = (
          await send({
            kind: "splice",
            origin: "canvas",
            section: owner.section,
            paragraph: owner.paragraph,
            startUnit: owner.manualFormulaResults[0].start,
            endUnit: owner.manualFormulaResults[0].start,
            text: "앞😀",
          })
        ).content;
        assert.notDeepEqual(changed, baseline);
        assert.deepEqual((await send({ kind: "undo" })).content, baseline);
        assert.deepEqual((await send({ kind: "redo" })).content, changed);
        const saved = (await send({ kind: "save" })).bytes;
        await send({ kind: "load", format: "hwpx", bytes: saved });
        const reopened = (await send({ kind: "enable" })).content;
        assert.deepEqual(
          reopened.paragraphs.map((p) => [p.paragraph, p.text, p.manualFormulaResults]),
          changed.paragraphs.map((p) => [p.paragraph, p.text, p.manualFormulaResults]),
        );
      }
    } finally {
      await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } });
      replies.length = 0;
    }
  },
);

test(
  "all tracked HWPX loads keep exact content with and without the batch export",
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const originalSelf = globalThis.self,
      originalFetch = globalThis.fetch,
      originalExports = WebAssembly.Module.exports;
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
      replies = [],
      paths = trackedHwpxFiles();
    assert.ok(
      originalExports(new WebAssembly.Module(wasm)).some(
        (entry) => entry.name === "hwpx_edit_manual_formula_result_display_snapshot",
      ),
    );
    let legacy = true,
      loaded = 0,
      refused = 0;
    WebAssembly.Module.exports = (module) =>
      originalExports(module).filter(
        (entry) => !legacy || entry.name !== "hwpx_edit_manual_formula_result_display_snapshot",
      );
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      WebAssembly.Module.exports = originalExports;
      globalThis.self = originalSelf;
      globalThis.fetch = originalFetch;
    });
    await import("../../web/preview/reader-worker.mjs?formula-batch-corpus=" + Date.now());
    try {
      for (const path of paths) {
        const input = readFileSync(path),
          source = Buffer.from(input);
        const load = async (old) => {
          legacy = old;
          await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: input } });
          assert.equal(replies.length, 1);
          return replies.shift();
        };
        const old = await load(true),
          current = await load(false);
        assert.deepEqual(current.content, old.content, path);
        assert.equal(current.error, old.error, path);
        assert.equal(current.passwordRequired, old.passwordRequired, path);
        if (current.error) {
          assert.equal(current.error, "EncryptedDocument", path);
          refused++;
        } else {
          assert.ok(current.content);
          loaded++;
        }
        assert.deepEqual(input, source);
      }
      t.diagnostic(JSON.stringify({ files: paths.length, loaded, refused }));
    } finally {
      await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } });
      replies.length = 0;
    }
  },
);
