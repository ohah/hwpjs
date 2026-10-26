import test from "node:test";
import assert from "node:assert/strict";
import { projectCreatedTableHost } from "../../web/preview/created-table-host-projection.mjs";
import { projectCreatedHostTextAnchors } from "../../web/preview/created-host-text-anchors.mjs";
import { measureCreatedTableHost } from "../../web/preview/created-table-host-measurement.mjs";

const number = {
  values: { num: 12, type_known: true },
  format: { raw: ["DIGIT", "", "", ")"], type_known: true, supscript: false },
};
const table = (anchorUnit) => ({ identity: "1", section: 0, hostParagraph: 1, anchorUnit });
const source = () => ({
  section: 0,
  paragraph: 1,
  text: "\ufffc 각주😀",
  editable: true,
  automaticNumbers: [{ unit: 0, source: structuredClone(number) }],
});

test("explicit bound native note references retain text width without inventing number values", () => {
  const host = { section: 0, paragraph: 1, text: "\ufffcX" };
  const projection = projectCreatedTableHost(host, [table(0)]);
  assert.deepEqual(projectCreatedHostTextAnchors(host, projection, [0]).textAnchorUnits, [1]);
  for (const units of [null, [0, 0], [1], [-1], [0.5], ["0"]]) {
    assert.throws(
      () => projectCreatedHostTextAnchors(host, projection, units),
      /UnsupportedCreatedTableHostControls/,
    );
  }
  const hidden = {
    ...host,
    structuralAnchors: [{ kind: "section", paragraph: 1, control_node: 7, unit: 0 }],
  };
  assert.throws(
    () => projectCreatedHostTextAnchors(hidden, projectCreatedTableHost(hidden, [table(0)]), [0]),
    /UnsupportedCreatedTableHostControls/,
  );
});

test("source automatic numbers remain text when a generated table shares their anchor", () => {
  for (const anchor of [0, 1, 4]) {
    const host = source(),
      before = structuredClone(host);
    const projection = projectCreatedTableHost(host, [table(anchor)]);
    const classified = projectCreatedHostTextAnchors(host, projection);
    assert.deepEqual(classified.textAnchorUnits, [anchor === 0 ? 1 : 0]);
    assert.equal(classified.automaticNumbers[0].unit, classified.textAnchorUnits[0]);
    const calls = [];
    const result = measureCreatedTableHost(
      host,
      [{ table: table(anchor), width: 32, height: 40 }],
      500,
      (text, owner, unit) => {
        assert.equal(owner, host);
        calls.push([text, unit]);
        return { width: [...text].length * 8, height: 16 };
      },
    );
    assert.equal(result.state, "measured", result.error);
    assert.equal(result.rows.map((row) => row.text).join(""), host.text);
    assert(calls.some(([text, unit]) => text === "12)" && unit === 0));
    assert.equal(result.anchors.length, 1);
    assert.equal(result.anchors[0].unit, anchor);
    assert.deepEqual(host, before);
  }
});

test("hidden source controls shift after generated placeholders in display windows", () => {
  const host = {
    section: 0,
    paragraph: 1,
    textStartUnit: 10,
    text: "\ufffcX",
    structuralAnchors: [{ kind: "section", paragraph: 1, control_node: 7, unit: 10 }],
  };
  const projection = projectCreatedTableHost(host, [table(10)]);
  const result = projectCreatedHostTextAnchors(host, projection);
  assert.deepEqual(result.zeroWidthUnits, [1]);
  assert.deepEqual(result.textAnchorUnits, []);
  assert.equal(result.structuralAnchors[0].unit, 1);
  assert.equal(host.structuralAnchors[0].unit, 10);
});

test("ambiguous unknown and page-dependent controls are refused rather than guessed", () => {
  const invalid = [
    {},
    { automaticNumbers: {} },
    { automaticNumbers: [{ unit: 0, source: { ...number, hwp5PageNumber: true } }] },
    { automaticNumbers: [{ unit: 0, source: { ...number, format: null } }] },
    {
      automaticNumbers: [
        { unit: 0, source: number },
        { unit: 0, source: number },
      ],
    },
    { automaticNumbers: [{ unit: 1, source: number }] },
    {
      automaticNumbers: [{ unit: 0, source: number }],
      structuralAnchors: [{ kind: "section", paragraph: 1, control_node: 7, unit: 0 }],
    },
    { pageControls: [{ unit: 0, section: 1, paragraph: 1 }] },
  ];
  for (const metadata of invalid) {
    const host = { section: 0, paragraph: 1, text: "\ufffcX", ...metadata };
    const before = structuredClone(host);
    assert.throws(
      () => projectCreatedHostTextAnchors(host, projectCreatedTableHost(host, [table(0)])),
      /UnsupportedCreatedTableHostControls/,
    );
    assert.deepEqual(host, before);
  }
});
