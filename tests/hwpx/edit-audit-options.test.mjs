import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseEditAuditOptions } from "../../tools/hwpx-edit-audit-options.mjs";
import { hwpxParagraphTextIndex } from "../../tools/hwpx-paragraph-text-index.mjs";

test("audit source text index preserves event order, sections, empty text and source snapshot", () => {
  const events = [
    { kind: "paragraph_start", section: 0, paragraph: 1 },
    { kind: "content", section: 0, paragraph: 1, value: "가😀" },
    { kind: "content", section: 1, paragraph: 1, value: "다른 구역" },
    { kind: "content", section: 0, paragraph: 1, value: "<&\r" },
    { kind: "content", section: 0, paragraph: 2, value: "" },
  ];
  const lookup = hwpxParagraphTextIndex(events);
  for (const section of [0, 1, 2])
    for (const paragraph of [0, 1, 2, 3])
      assert.equal(
        lookup(section, paragraph),
        events
          .filter((e) => e.kind === "content" && e.section === section && e.paragraph === paragraph)
          .map((e) => e.value)
          .join(""),
      );
  events[1].value = "changed";
  events.length = 0;
  assert.equal(lookup(0, 1), "가😀<&\r");
  assert.throws(() => hwpxParagraphTextIndex(null), /InvalidParagraphEvents/);
});

test("audit source lookup scans events once rather than once per paragraph", () => {
  let visits = 0;
  const events = Array.from({ length: 10000 }, (_, paragraph) => ({
    get kind() {
      visits++;
      return "content";
    },
    section: 0,
    paragraph,
    value: `${paragraph}😀`,
  }));
  const lookup = hwpxParagraphTextIndex(events);
  assert.equal(visits, events.length);
  for (let paragraph = 0; paragraph < events.length; paragraph++)
    assert.equal(lookup(0, paragraph), `${paragraph}😀`);
  assert.equal(visits, events.length, "lookups must not rescan source events");
});

test("progress intervals are opt-in canonical bounded integers and never a scope limit", () => {
  assert.deepEqual(parseEditAuditOptions(["--progress-every=2"], { allowProgress: true }), {
    progressEvery: 2,
  });
  for (const value of [
    "",
    "0",
    "01",
    "-1",
    "1.5",
    "1e2",
    "Infinity",
    "1000001",
    "9007199254740992",
  ])
    assert.throws(
      () => parseEditAuditOptions([`--progress-every=${value}`], { allowProgress: true }),
      /InvalidAuditProgressInterval/,
    );
  assert.throws(
    () =>
      parseEditAuditOptions(["--progress-every=1", "--progress-every=2"], { allowProgress: true }),
    /DuplicateAuditArgument/,
  );
  assert.throws(() => parseEditAuditOptions(["--progress-every=1"]), /Unknown argument/);
});

test("edit audits share exact option validation without silent scope reduction", () => {
  assert.deepEqual(
    parseEditAuditOptions(["--wasm=/tmp/candidate.wasm", "--fixture=a.hwpx", "--history"], {
      allowHistory: true,
    }),
    { wasm: "/tmp/candidate.wasm", fixture: "a.hwpx", history: true },
  );
  for (const args of [
    ["--fixture=a", "--fixture=b"],
    ["--wasm=a", "--wasm=b"],
    ["--history", "--history"],
  ])
    assert.throws(
      () => parseEditAuditOptions(args, { allowHistory: true }),
      /DuplicateAuditArgument/,
    );
  for (const arg of ["--wasm=", "--fixture=", "--unknown", "--history"])
    assert.throws(() => parseEditAuditOptions([arg]), /Unknown argument/);
  assert.throws(() => parseEditAuditOptions([], { requireWasm: true }), /MissingAuditWasm/);
  assert.deepEqual(parseEditAuditOptions(["--wasm=a"], { requireWasm: true }), { wasm: "a" });
});

test("explicit paragraph shards require a fixture artifact and a nonempty safe exclusive range", () => {
  const prefix = ["--wasm=a", "--fixture=b"];
  const options = { allowParagraphRange: true };
  assert.deepEqual(
    parseEditAuditOptions([...prefix, "--paragraphs=196:197"], options).paragraphRange,
    { start: 196, end: 197 },
  );
  for (const value of [
    "0:1",
    "1:1",
    "2:1",
    "01:2",
    "1:02",
    "1:2:3",
    "1:4294967297",
    "1:9007199254740992",
    "-1:2",
    "1.5:2",
    "1:Infinity",
    "",
  ]) {
    assert.throws(
      () => parseEditAuditOptions([...prefix, `--paragraphs=${value}`], options),
      /InvalidAuditParagraphRange/,
    );
  }
  assert.throws(
    () => parseEditAuditOptions([...prefix, "--paragraphs=1:2", "--paragraphs=2:3"], options),
    /DuplicateAuditArgument/,
  );
  for (const args of [[], ["--wasm=a"], ["--fixture=b"]])
    assert.throws(
      () => parseEditAuditOptions([...args, "--paragraphs=1:2"], options),
      /AuditParagraphRangeRequiresFixtureAndWasm/,
    );
  assert.throws(() => parseEditAuditOptions([...prefix, "--paragraphs=1:2"]), /Unknown argument/);
});

test("real paragraph ranges preserve full-run totals and explicitly report partial coverage", (t) => {
  if (!process.env.HWPJS_TEST_WASM) {
    t.skip("explicit candidate WASM required for actual audit subprocesses");
    return;
  }
  const args = [
    "tools/hwpx-edit-corpus-audit.mjs",
    `--wasm=${process.env.HWPJS_TEST_WASM}`,
    "--fixture=legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx",
    "--history",
  ];
  const run = (extra) => {
    const result = spawnSync(process.execPath, [...args, ...extra], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return result;
  };
  const success = (extra) => {
    const result = run(extra);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return result.stdout.trim().split("\n").map(JSON.parse);
  };
  const full = success([]),
    whole = success(["--paragraphs=1:8"]),
    part = success(["--paragraphs=3:5"]);
  assert.deepEqual(full.at(-1).totals, whole.at(-1).totals);
  assert.equal(full.at(-1).totals.paragraphs, 7);
  assert.equal(whole[1].completeFixture, true);
  assert.equal(part[1].inputParagraphs, 7);
  assert.equal(part[1].paragraphs, 2);
  assert.equal(part[1].completeFixture, false);
  assert.equal(part.at(-1).totals.paragraphs, 2);
  assert.deepEqual(part[0].paragraphRange, { start: 3, end: 5 });
  const bad = run(["--paragraphs=7:9"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /AuditParagraphRangeOutOfBounds/);
  assert.equal(
    bad.stdout.trim().split("\n").length,
    1,
    "no misleading success summary after invalid range",
  );
  const observed = success(["--progress-every=2"]),
    progress = observed.filter((row) => row.kind === "progress");
  assert.deepEqual(observed.at(-1).totals, full.at(-1).totals);
  assert.deepEqual(
    progress.map((row) => row.completed),
    [2, 4, 6],
  );
  for (const row of progress) {
    assert.equal(row.status, "in_progress");
    assert.equal(row.selectedParagraphs, 7);
    assert.equal(row.inputParagraphs, 7);
    assert.equal(row.accepted + row.refused, row.completed);
    assert.equal(row.lastParagraph, row.completed);
  }
  const observedPart = success(["--paragraphs=3:5", "--progress-every=1"]);
  assert.deepEqual(observedPart.at(-1).totals, part.at(-1).totals);
  assert.deepEqual(
    observedPart
      .filter((row) => row.kind === "progress")
      .map((row) => [
        row.completed,
        row.selectedParagraphs,
        row.inputParagraphs,
        row.lastParagraph,
      ]),
    [
      [1, 2, 7, 3],
      [2, 2, 7, 4],
    ],
  );
  assert.equal(observedPart.at(-2).completeFixture, false);
  const numeric = spawnSync(
    process.execPath,
    [
      "tools/hwpx-edit-corpus-audit.mjs",
      `--wasm=${process.env.HWPJS_TEST_WASM}`,
      "--fixture=legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx",
      "--paragraphs=20:21",
      "--history",
      "--progress-every=1",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(numeric.error, undefined);
  assert.equal(numeric.signal, null);
  assert.equal(numeric.status, 0, numeric.stderr);
  const numericRows = numeric.stdout.trim().split("\n").map(JSON.parse),
    refused = numericRows.find((row) => row.kind === "progress");
  assert.equal(refused.completed, 1);
  assert.equal(refused.accepted, 0);
  assert.equal(refused.refused, 1);
  assert.equal(refused.status, "in_progress");
  assert.deepEqual(numericRows.at(-1).totals.refused, { InvalidFormulaNumber: 1 });
  assert.equal(numericRows.at(-2).completeFixture, false);
});
