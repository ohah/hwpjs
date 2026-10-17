import test from "node:test";
import assert from "node:assert/strict";
import { chartSeriesControlsHarness } from "./chart-series-controls-harness.mjs";

const content = { chartEditAvailable: true, chartStringEditAvailable: true, chartSeriesTextEditAvailable: true, chartTargets: [{ section: 0, wrapper: 9 }] };

test("chart query waits for a competing inspector request and retries once after its reply", async () => {
  const h = chartSeriesControlsHarness();
  try {
    h.state.ready = false;
    h.controls.message({ kind: "enable", content });
    await Promise.resolve();
    assert.equal(h.requests.length, 0);
    h.state.ready = true;
    h.controls.message({ kind: "inline-string-sources", requestId: 5 });
    await Promise.resolve();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].kind, "chart-points");
    h.controls.message({ kind: "unrelated-reply" });
    await Promise.resolve();
    assert.equal(h.requests.length, 1, "a sent query must not be duplicated");
  } finally { h.controls.close(); }
});

for (const cancel of ["load", "close"]) test(`chart pending readiness query is cancelled by ${cancel}`, async () => {
  const h = chartSeriesControlsHarness();
  try {
    h.state.ready = false;
    h.controls.message({ kind: "enable", content });
    await Promise.resolve();
    if (cancel === "load") h.controls.message({ kind: "load" });
    else h.controls.close();
    h.state.ready = true;
    h.controls.message({ kind: "inline-string-sources" });
    await Promise.resolve();
    assert.equal(h.requests.length, 0);
  } finally { h.controls.close(); }
});
