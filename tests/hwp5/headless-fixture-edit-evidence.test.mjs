import test from "node:test";
import assert from "node:assert/strict";
import { verifiedFixtureEvidence } from "../../tools/headless-fixture-edit-evidence.mjs";
const keys = [
  "packages/core/dist/index.js",
  "packages/core/dist/runtime.js",
  "apps/demo/src/document-loader.ts",
  "tools/hwpx-plain-splice-oracle.py",
  "tools/hwpx_text_snapshot_order.py",
  "tests/hwp5/style-preservation/text-record-oracle.mjs",
];
function sample() {
  const provenance = Object.fromEntries(keys.map((key) => [key, "b".repeat(64)]));
  const report = {
    manifest: {
      wasmSHA: "a".repeat(64),
      provenance,
      inputs: [{ path: "sample.hwpx", sha256: "c".repeat(64) }],
    },
    summary: {
      completedPaths: 1,
      selectedPaths: 1,
      implementationUnchanged: true,
      sourceFilesUnchanged: true,
      wasmUnchanged: true,
      cancelled: true,
    },
    results: [
      {
        path: "sample.hwpx",
        sourceSHA: "c".repeat(64),
        format: "hwpx",
        oracle: {
          controls: [
            { mode: "normal", status: "pass", wrongExpectedRejected: true },
            { mode: "optimized", status: "pass", wrongExpectedRejected: true },
          ],
        },
        status: "verified",
        independentVerified: true,
        sourceUnchanged: true,
        cleanup: { ownedGroupInactive: true, remainingDescendants: false },
        childExitCode: 0,
        childSignal: null,
        lifecycle: {
          loaded: true,
          applied: true,
          selectedText: true,
          saved: true,
          undo: true,
          redo: true,
          reopened: true,
          exactResave: true,
          complete: true,
        },
      },
    ],
  };
  return { report, current: { wasmSHA: "a".repeat(64), provenance: structuredClone(provenance) } };
}
test("a checkpoint preserves completed independent observations, not cancelled cases", () => {
  const { report, current } = sample();
  const actual = verifiedFixtureEvidence(report, current);
  assert.equal(actual.size, 1);
  assert.equal(actual.get("c".repeat(64)), report.results[0]);
  report.results[0].status = "cancelled";
  assert.equal(verifiedFixtureEvidence(report, current).size, 0);
});
test("changed artifacts and incomplete or foreign results cannot become reused verification", () => {
  for (const mutate of [
    (x) => {
      x.current.wasmSHA = "new";
    },
    (x) => {
      x.current.provenance[keys[0]] = "new";
    },
    (x) => {
      x.report.summary.implementationUnchanged = false;
    },
    (x) => {
      x.report.results[0].sourceSHA = "foreign";
    },
    (x) => {
      x.report.results[0].independentVerified = false;
    },
    (x) => {
      x.report.results[0].lifecycle.redo = false;
    },
    (x) => {
      x.report.results[0].cleanup.remainingDescendants = true;
    },
    (x) => {
      x.report.results[0].childExitCode = 7;
    },
    (x) => {
      x.report.results[0].oracle.controls.pop();
    },
    (x) => {
      x.report.results[0].oracle.controls[0].wrongExpectedRejected = false;
    },
    (x) => {
      x.report.summary.completedPaths = 2;
    },
  ]) {
    const x = sample();
    mutate(x);
    assert.throws(() => verifiedFixtureEvidence(x.report, x.current));
  }
});

test("prefix-era evidence requires unchanged source routing and complete ZIP oracle fingerprints", () => {
  for (const key of [
    "tools/hwpx-insertion-oracle.mjs",
    "tools/hwpx-insertion-site.py",
    "tools/hwpx-insertion-source.py",
    "tools/hwpx-anchor-prefix-oracle.py",
  ]) {
    const { report, current } = sample();
    report.manifest.provenance[key] = "d".repeat(64);
    assert.throws(() => verifiedFixtureEvidence(report, current), /ReusedEvidenceOracleMismatch/);
    current.provenance[key] = "d".repeat(64);
    assert.equal(verifiedFixtureEvidence(report, current).size, 1);
    current.provenance[key] = "e".repeat(64);
    assert.throws(() => verifiedFixtureEvidence(report, current), /ReusedEvidenceOracleMismatch/);
  }
});

test("password-policy fingerprints cannot silently change under reused observations", () => {
  const { report, current } = sample(),
    key = "tools/fixture-known-password.mjs";
  report.manifest.provenance[key] = "d".repeat(64);
  assert.throws(
    () => verifiedFixtureEvidence(report, current),
    /ReusedEvidencePasswordPolicyMismatch/,
  );
  current.provenance[key] = "d".repeat(64);
  assert.equal(verifiedFixtureEvidence(report, current).size, 1);
  current.provenance[key] = "e".repeat(64);
  assert.throws(
    () => verifiedFixtureEvidence(report, current),
    /ReusedEvidencePasswordPolicyMismatch/,
  );
});
