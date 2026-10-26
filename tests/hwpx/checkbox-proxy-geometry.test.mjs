import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBoxProxyBoxes,
  hitCheckBoxProxy,
} from "../../web/preview/checkbox-proxy-geometry.mjs";
import { projectDraftAnchoredObjects } from "../../web/preview/anchored-object-draft.mjs";
test("checkbox proxy hits obey transforms clipping and shared draft unit projection", () => {
  const checkBox = {
    section: 0,
    paragraph: 0,
    formNode: 4,
    anchorUnit: 0,
    siteState: "located",
    state: "CHECKED",
  };
  const box = { x: 10, y: 20, width: 8, height: 8, transform: [2, 0, 0, 2, 100, 200], checkBox };
  assert.equal(hitCheckBoxProxy([box], 128, 248), box);
  assert.equal(hitCheckBoxProxy([box], 14, 24), null);
  assert.equal(
    hitCheckBoxProxy([{ ...box, pageClip: { x: 0, y: 0, width: 10, height: 10 } }], 128, 248),
    null,
  );
  assert.equal(hitCheckBoxProxy([{ ...box, transform: [0, 0, 0, 0, 0, 0] }], 128, 248), null);
  assert.equal(hitCheckBoxProxy([box], NaN, 0), null);
  const content = {
    checkBoxStateAvailable: true,
    paragraphs: [{ section: 0, paragraph: 0, text: "\ufffc" }],
    checkBoxes: [checkBox],
  };
  assert.deepEqual(
    projectDraftAnchoredObjects(
      content,
      [checkBox],
      { section: 0, paragraph: 0, text: "앞😀\ufffc" },
      "siteState",
    )[0].anchorUnit,
    3,
  );
  assert.deepEqual(
    projectDraftAnchoredObjects(
      content,
      [checkBox],
      { section: 0, paragraph: 0, text: "" },
      "siteState",
    ),
    [],
  );
  assert.deepEqual(
    checkBoxProxyBoxes({ ...content, checkBoxStateAvailable: false }, { rows: [] }),
    [],
  );
  assert.deepEqual(
    checkBoxProxyBoxes(
      { ...content, checkBoxes: [{ ...checkBox, state: "FUTURE" }] },
      { rows: [] },
    ),
    [],
  );
});
