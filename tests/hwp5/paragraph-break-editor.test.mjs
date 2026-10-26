import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { inspect, paragraphRecords } from "./style-preservation/text-record-oracle.mjs";
import { expectedSplitSection } from "./style-preservation/structure-record-oracle.mjs";

const wasm = process.env.HWPJS_TEST_WASM ? readFileSync(process.env.HWPJS_TEST_WASM) : null;
for (const format of ["hwp5", "hwpx"])
  for (const history of [false, true])
    for (const kind of ["page", "column"]) {
      test(
        `${format} explicit ${kind} split has independent saved flow with history=${history}`,
        { skip: !wasm ? "explicit flow-break candidate WASM required" : false },
        async () => {
          const input = readFileSync(
            `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
          );
          const editor =
            format === "hwp5"
              ? await createExperimentalHwp5Editor(wasm, input)
              : await createHwpxEditor(wasm);
          if (format === "hwpx") editor.open(input);
          const save = () =>
            Buffer.from(
              format === "hwp5" ? editor.save({ allowStaleLayout: true }).bytes : editor.save(),
            );
          try {
            assert.equal(
              editor.supportsParagraphBreaks(),
              true,
              "candidate must advertise the optional flow ABI",
            );
            if (history) editor.enableHistory();
            editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind });
            const saved = save();
            if (format === "hwp5") {
              const before = inspect(input),
                after = inspect(saved);
              const expected = expectedSplitSection(before.sections, 0, 1, 0);
              const right = paragraphRecords(expected, 2).head;
              expected[right.start + right.raw.length - right.payload.length + 11] =
                kind === "page" ? 4 : 8;
              assert.deepEqual(after.sections[0].bytes, expected);
              assert.deepEqual(after.metadata, before.metadata);
              assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
              for (const [path, bytes] of before.streams)
                if (path !== before.sections[0].path)
                  assert.deepEqual(after.streams.get(path), bytes, path);
            } else {
              const payload = JSON.stringify({
                before: input.toString("base64"),
                after: saved.toString("base64"),
                kind,
              });
              for (const flags of [[], ["-O"]]) {
                assert.equal(
                  execFileSync("python3", [...flags, "tools/hwpx-flow-break-oracle.py"], {
                    input: payload,
                    encoding: "utf8",
                  }).trim(),
                  "verified",
                );
                const wrong = spawnSync("python3", [...flags, "tools/hwpx-flow-break-oracle.py"], {
                  input: JSON.stringify({
                    ...JSON.parse(payload),
                    kind: kind === "page" ? "column" : "page",
                  }),
                  encoding: "utf8",
                });
                assert.notEqual(wrong.status, 0);
                assert.match(wrong.stderr, /Wrong explicit flow flags/);
              }
            }
            if (history) {
              assert.equal(editor.undo(), true);
              assert.deepEqual(save(), input);
              assert.equal(editor.undo(), false);
              assert.equal(editor.redo(), true);
              assert.deepEqual(save(), saved);
            }
            const reopened =
              format === "hwp5"
                ? await createExperimentalHwp5Editor(wasm, saved)
                : await createHwpxEditor(wasm);
            try {
              if (format === "hwpx") reopened.open(saved);
              assert.equal(reopened.supportsParagraphBreaks(), true);
              const unchanged = format === "hwp5" ? reopened.save().bytes : reopened.save();
              assert.deepEqual(Buffer.from(unchanged), saved);
            } finally {
              reopened.close();
            }
          } finally {
            editor.close();
          }
        },
      );
    }

for (const format of ["hwp5", "hwpx"]) {
  test(
    `${format} native flow ABI rejects malformed tags without consuming pending redo`,
    { skip: !wasm ? "explicit flow-break candidate WASM required" : false },
    async (t) => {
      const instantiate = WebAssembly.instantiate;
      let native;
      t.mock.method(WebAssembly, "instantiate", async (...args) => {
        const instance = await instantiate(...args);
        native = instance.exports;
        return instance;
      });
      const input = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
      );
      const editor =
        format === "hwp5"
          ? await createExperimentalHwp5Editor(wasm, input)
          : await createHwpxEditor(wasm);
      if (format === "hwpx") editor.open(input);
      const save = () =>
        Buffer.from(
          format === "hwp5" ? editor.save({ allowStaleLayout: true }).bytes : editor.save(),
        );
      try {
        editor.enableHistory();
        editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 0, kind: "page" });
        const saved = save();
        assert.equal(editor.undo(), true);
        for (const tag of [0, 3, 4, 0xffffffff]) {
          assert.equal(native[`${format}_edit_split_with_break`](0, 1, 0, 0, tag), 0);
          assert.deepEqual(save(), input);
        }
        assert.equal(editor.undo(), false);
        assert.equal(editor.redo(), true);
        assert.deepEqual(save(), saved);
      } finally {
        editor.close();
      }
    },
  );
}
