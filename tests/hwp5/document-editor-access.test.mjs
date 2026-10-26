import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartDocumentSession,
  documentFormatLabel,
} from "../../web/preview/document-editor-access.mjs";
test("readonly text policy does not hide an existing native HWP5 session", () => {
  const content = { format: "hwp5", version: "5.0", readOnly: true, editorSessionAvailable: true };
  assert.equal(canStartDocumentSession(content), true);
  assert.equal(documentFormatLabel(content), "HWP 5.0 · 읽기 전용");
  assert.equal(canStartDocumentSession({ ...content, editorSessionAvailable: false }), false);
  assert.equal(canStartDocumentSession({ ...content, editorSessionAvailable: "true" }), false);
});
test("distribution normalization and available-section consent gates remain distinct", () => {
  const content = {
    format: "hwp5",
    version: "5.0",
    readOnly: true,
    primarySource: "distribution_viewtext",
  };
  assert.equal(canStartDocumentSession(content), false);
  assert.equal(documentFormatLabel(content), "HWP 5.0 · 배포용 읽기 전용");
  assert.equal(canStartDocumentSession({ ...content, distributionEditingAvailable: true }), true);
  assert.equal(canStartDocumentSession({ ...content, normalizationEditingAvailable: true }), true);
  const available = {
    ...content,
    availableSectionsOnly: true,
    editorSessionAvailable: true,
    normalizationEditingAvailable: true,
  };
  assert.equal(canStartDocumentSession(available), false);
  assert.equal(documentFormatLabel(available), "HWP 5.0 · 저장된 구역만 읽기 전용");
  assert.equal(
    canStartDocumentSession({ format: "hwpx", readOnly: true, editorSessionAvailable: true }),
    false,
  );
  assert.equal(canStartDocumentSession({ format: "hwpx", readOnly: false }), true);
  assert.equal(canStartDocumentSession({ format: "unknown" }), false);
  assert.equal(canStartDocumentSession(null), false);
});

test("observed DocInfo suggestion applies only to HWP5 and never overrides available-section readonly mode", () => {
  const content = { format: "hwp5", readOnly: true, observedDocInfoEditingAvailable: true };
  assert.equal(canStartDocumentSession(content), true);
  for (const value of [false, undefined, "true", 1])
    assert.equal(
      canStartDocumentSession({ ...content, observedDocInfoEditingAvailable: value }),
      false,
    );
  assert.equal(canStartDocumentSession({ ...content, format: "hwpx" }), false);
  assert.equal(canStartDocumentSession({ ...content, availableSectionsOnly: true }), false);
});
