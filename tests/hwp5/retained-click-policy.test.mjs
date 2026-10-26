import test from "node:test";
import assert from "node:assert/strict";
import { attachHwp5TextSourcePolicy } from "../../web/preview/hwp5-text-source-policy.mjs";
function fixture() {
  const content = {
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        editable: false,
        fieldTopologyEditableCandidate: true,
        fieldTopologyError: "UnresolvedFieldMarkers",
      },
      { section: 0, paragraph: 1, editable: true },
      {
        section: 0,
        paragraph: 2,
        editable: false,
        selectable: false,
        windowContext: true,
        fieldTopologyEditableCandidate: true,
      },
      {
        section: 0,
        paragraph: 3,
        editable: false,
        clipped: true,
        fieldTopologyEditableCandidate: true,
      },
    ],
  };
  let queries = 0;
  const editor = {
    supportsTextSourcePolicy: () => true,
    validateTextSourcePolicy: () => {
      throw new Error("UnsupportedCrossParagraphField");
    },
    supportsTextSourceProtection: () => true,
    paragraphCount: () => 4,
    textSourceProtection: () => {
      queries++;
      return {
        mode: "retained_click",
        retained_headers: 1,
        protected_paragraphs: [false, true, false, false],
      };
    },
  };
  return { content, editor, queries: () => queries };
}
test("retained policy uses one native map and restores only its own original window candidate", () => {
  const h = fixture();
  attachHwp5TextSourcePolicy(h.editor, h.content);
  assert.equal(h.queries(), 1);
  assert.equal(h.content.retainedClickFieldProtection, true);
  assert.equal(h.content.paragraphs[0].editable, true);
  assert.equal(h.content.paragraphs[0].fieldTopologyError, undefined);
  assert.equal(h.content.paragraphs[1].editable, false);
  assert.equal(h.content.paragraphs[1].textSourcePolicyError, "UnsupportedCrossParagraphField");
  assert.equal(h.content.paragraphs[2].editable, false);
  assert.equal(h.content.paragraphs[2].selectable, false);
  assert.equal(h.content.paragraphs[3].editable, false);
  assert.equal(h.content.readOnly, false);
});
test("retained policy never recovers generic failures missing ABI malformed maps or wrong modes", () => {
  for (const message of ["OutOfMemory", "InvalidSection"]) {
    const h = fixture();
    attachHwp5TextSourcePolicy(
      {
        ...h.editor,
        validateTextSourcePolicy: () => {
          throw new Error(message);
        },
      },
      h.content,
    );
    assert.equal(h.queries(), 0);
    assert(h.content.paragraphs.every((p) => !p.editable));
    assert(h.content.paragraphs.every((p) => p.textSourcePolicyError === message));
  }
  const broken = [
    { supportsTextSourceProtection: () => false },
    {
      textSourceProtection: () => {
        throw new Error("OutOfMemory");
      },
    },
    {
      textSourceProtection: () => ({
        mode: "retained_click",
        retained_headers: 1,
        protected_paragraphs: [false],
      }),
    },
    {
      textSourceProtection: () => ({
        mode: "strict",
        retained_headers: null,
        protected_paragraphs: [false, false, false, false],
      }),
    },
  ];
  for (const delta of broken) {
    const h = fixture();
    attachHwp5TextSourcePolicy({ ...h.editor, ...delta }, h.content);
    assert(h.content.paragraphs.every((p) => !p.editable));
    assert.equal(h.content.readOnly, true);
  }
  const h = fixture();
  h.content.paragraphs[0].paragraph = 4;
  attachHwp5TextSourcePolicy(h.editor, h.content);
  assert.equal(h.content.paragraphs[0].editable, false);
  assert.equal(h.content.paragraphs[0].textSourcePolicyError, "InvalidHwp5TextSourceProtection");
});
