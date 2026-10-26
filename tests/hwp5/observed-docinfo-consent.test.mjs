import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareObservedDocInfoEnable,
  OBSERVED_DOCINFO_WARNING,
  observedDocInfoSummary,
} from "../../web/preview/observed-docinfo-consent.mjs";
import { createEditorControls } from "../../web/preview/editor-controls.mjs";
import { NORMALIZATION_WARNING } from "../../web/preview/normalization-consent.mjs";

test("observed DocInfo consent applies only to the explicit policy and requires exact acceptance", () => {
  const message = { kind: "enable", retainObservedDocInfo: true };
  for (const answer of [false, undefined, 1, "yes"]) {
    assert.equal(
      prepareObservedDocInfoEnable(message, true, (warning) => {
        assert.equal(warning, OBSERVED_DOCINFO_WARNING);
        return answer;
      }),
      null,
    );
  }
  assert.equal(
    prepareObservedDocInfoEnable(message, true, () => true),
    message,
  );
  assert.equal(
    prepareObservedDocInfoEnable(message, false, () => {
      throw Error("UnexpectedPrompt");
    }),
    null,
  );
  for (const other of [{ kind: "enable" }, { kind: "splice" }])
    assert.equal(
      prepareObservedDocInfoEnable(other, true, () => {
        throw Error("UnexpectedPrompt");
      }),
      other,
    );
});

test("observed DocInfo warning keeps unresolved data and count mismatch explicit", () => {
  assert.equal(observedDocInfoSummary(null), null);
  const summary = observedDocInfoSummary({
    absent_carets: 1,
    unresolved_font_types: 31,
    unresolved_style_characters: 50,
    unresolved_character_tails: 55,
    absent_fill_additionals: 13,
    resource_count_mismatch: true,
  });
  assert.match(summary, /150개/);
  assert.match(summary, /리소스 개수 불일치 유지/);
});

test("separate observed-policy button keeps two consents explicit and resets with the file", (t) => {
  const ids = [
    "#editor-panel",
    "#enable-edit",
    "#enable-observed-docinfo-edit",
    "#edit-fields",
    "#edit-status",
    "#edit-form",
    "#format-button",
  ];
  const nodes = new Map(
    ids.map((id) => [id, Object.assign(new EventTarget(), { textContent: "" })]),
  );
  nodes.get("#edit-form").elements = { charShapeId: { value: "0", reportValidity: () => true } };
  const previous = globalThis.document;
  globalThis.document = { querySelector: (id) => nodes.get(id) };
  t.after(() => {
    globalThis.document = previous;
  });
  const sent = [],
    warnings = [];
  let accept = false;
  const controls = createEditorControls((message) => sent.push(message), {
    confirmNormalization: (warning) => {
      warnings.push(warning);
      return accept;
    },
  });
  const button = nodes.get("#enable-observed-docinfo-edit");
  controls.reset();
  controls.loaded({ normalization: true, observedDocInfo: true });
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  button.dispatchEvent(new Event("click"));
  assert.equal(sent.length, 0);
  assert.equal(controls.busy(), false);
  assert.deepEqual(warnings, [OBSERVED_DOCINFO_WARNING]);
  warnings.length = 0;
  accept = true;
  button.dispatchEvent(new Event("click"));
  assert.deepEqual(warnings, [OBSERVED_DOCINFO_WARNING, NORMALIZATION_WARNING]);
  assert.deepEqual(sent, [
    { kind: "enable", retainObservedDocInfo: true, normalizeObservedCfb: true },
  ]);
  assert.equal(button.disabled, true);
  controls.reset();
  controls.loaded();
  assert.equal(button.hidden, true);
  button.dispatchEvent(new Event("click"));
  assert.equal(
    sent.length,
    1,
    "unavailable policy must remain blocked even if an event is dispatched",
  );
  controls.request({ kind: "enable" });
  assert.deepEqual(sent.at(-1), { kind: "enable" });
});
