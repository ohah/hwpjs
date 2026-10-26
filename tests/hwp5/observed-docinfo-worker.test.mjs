import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";

test(
  "Worker observed DocInfo enforces capability and explicit selection",
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const path = "reference/rhwp/samples/20250130-hongbo_saved.hwp";
    if (!existsSync(path)) {
      t.skip("observed DocInfo reference fixture unavailable");
      return;
    }
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
    const available = [
      "hwp5_edit_open_observed_docinfo",
      "hwp5_edit_observed_docinfo_diagnostics",
    ].every((name) =>
      WebAssembly.Module.exports(new WebAssembly.Module(wasm)).some((row) => row.name === name),
    );
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    globalThis.self = { postMessage: (message) => replies.push(message) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import("../../web/preview/reader-worker.mjs?observed-docinfo=" + Date.now());
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      return replies.shift();
    };
    try {
      const input = readFileSync(path);
      const loaded = await send({ kind: "load", bytes: input });
      assert.equal(loaded.error, undefined);
      if (!available) {
        assert.equal(loaded.content.observedDocInfoEditingAvailable, undefined);
        assert.equal(loaded.content.observedDocInfoDiagnostics, undefined);
        assert.equal(
          (await send({ kind: "enable", normalizeObservedCfb: true, retainObservedDocInfo: true }))
            .error,
          "Hwp5ObservedDocInfoAbiUnavailable",
        );
        const ordinary = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp");
        assert.equal((await send({ kind: "load", bytes: ordinary })).error, undefined);
        assert.equal((await send({ kind: "enable" })).error, undefined);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), ordinary);
        assert.deepEqual(readFileSync(path), input);
        t.diagnostic(
          "old ABI: explicit refusal and unchanged ordinary edit session only; observed-mode editing not supported",
        );
        return;
      }
      assert.equal(loaded.content.observedDocInfoEditingAvailable, true);
      assert.equal(loaded.content.observedDocInfoDiagnostics, null);
      assert.equal(
        (await send({ kind: "enable", retainObservedDocInfo: "yes" })).error,
        "InvalidObservedDocInfoPolicy",
      );
      assert.equal(
        (await send({ kind: "enable", normalizeObservedCfb: true })).error,
        "UnexpectedEnd",
      );
      const enabled = await send({
        kind: "enable",
        normalizeObservedCfb: true,
        retainObservedDocInfo: true,
      });
      assert.equal(enabled.error, undefined);
      const diagnostics = enabled.content.observedDocInfoDiagnostics;
      assert.equal(diagnostics.unresolved_style_characters, 50);
      assert.equal(diagnostics.resource_count_mismatch, true);
      const baseline = await send({ kind: "save" });
      assert.equal(baseline.error, undefined);
      const target = enabled.content.paragraphs.find(
        // oxlint-disable-next-line no-control-regex -- 관측 DocInfo 시험에서 제어문자·개체 마커가 없는 실제 텍스트 행만 선택한다.
        (row) => row.text.trim() && !/[\u0000-\u000c\u000e-\u001f\ufffc]/u.test(row.text),
      );
      assert.ok(target);
      const changed = await send({
        kind: "splice",
        section: target.section,
        paragraph: target.paragraph,
        startUnit: 0,
        endUnit: 0,
        text: "워커😀",
      });
      assert.equal(changed.error, undefined);
      assert.deepEqual(changed.content.observedDocInfoDiagnostics, diagnostics);
      const saved = await send({ kind: "save", allowStaleLayout: true });
      assert.equal(saved.error, undefined);
      verifyRaw(baseline.bytes, saved.bytes, target.section, target.paragraph, 0, 0, "워커😀");
      assert.equal((await send({ kind: "undo" })).error, undefined);
      assert.deepEqual((await send({ kind: "save" })).bytes, baseline.bytes);
      assert.equal((await send({ kind: "redo" })).error, undefined);
      assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
      assert.equal(
        (await send({ kind: "enable", retainObservedDocInfo: true })).error,
        "ObservedDocInfoRequiresFreshSession",
      );
      const next = await send({
        kind: "load",
        bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp"),
      });
      assert.equal(next.error, undefined);
      assert.equal(next.content.observedDocInfoDiagnostics, null);
      assert.equal(next.content.observedDocInfoEditingAvailable, false);
      const hwpx = await send({
        kind: "load",
        format: "hwpx",
        bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwpx"),
      });
      assert.equal(hwpx.error, undefined);
      for (const value of [true, false, "yes"]) {
        assert.equal(
          (await send({ kind: "enable", retainObservedDocInfo: value })).error,
          "UnsupportedObservedDocInfoFormat",
        );
      }
      t.diagnostic(
        "observed ABI: explicit enable, raw save oracle, history and next-file reset verified",
      );
    } finally {
      await send({ kind: "load", format: "close-audit", bytes: [] });
    }
  },
);
