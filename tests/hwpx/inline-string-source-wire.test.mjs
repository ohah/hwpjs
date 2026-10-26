import test from "node:test";
import assert from "node:assert/strict";
import { decodeInlineStringSources } from "../../js/hwpx-inline-string-sources.mjs";

test("source inline string packet keeps zero attributes distinct and rejects broken ownership", () => {
  const original = {
    sourceOnly: true,
    controls: [
      {
        section_ordinal: 0,
        element_index: 3,
        parent_element_index: 2,
        parent_uri: "paragraph",
        parent_local_name: "run",
        kind: "dutmal",
        raw_xml: "<p:dutmal/>",
        direct_text: "",
        first_text: 0,
        text_count: 2,
        direct_children: 2,
        unknown_children: 0,
        other_attributes: 0,
        attributes: {
          pos_type: "TOP",
          sz_ratio: "0",
          option: "0",
          style_id_ref: "0",
          alignment: "CENTER",
        },
      },
    ],
    texts: [
      {
        control_index: 0,
        element_index: 4,
        kind: "main_text",
        raw_xml: "<p:mainText/>",
        value: "한😀",
        direct_children: 0,
        other_attributes: 0,
      },
      {
        control_index: 0,
        element_index: 5,
        kind: "sub_text",
        raw_xml: "<p:subText/>",
        value: "주석",
        direct_children: 0,
        other_attributes: 0,
      },
    ],
  };
  const encode = (v) => new TextEncoder().encode(JSON.stringify(v));
  assert.deepEqual(decodeInlineStringSources(encode(original)), original);
  for (const mutate of [
    (v) => {
      v.sourceOnly = false;
    },
    (v) => {
      v.controls[0].first_text = 1;
    },
    (v) => {
      v.controls[0].text_count = 3;
    },
    (v) => {
      v.texts[0].control_index = 1;
    },
    (v) => {
      v.texts[0].element_index = 3;
    },
    (v) => {
      v.texts[1].element_index = 4;
    },
    (v) => {
      v.controls[0].attributes.sz_ratio = 0;
    },
    (v) => {
      v.texts[0].kind = "unknown";
    },
    (v) => {
      v.controls[0].section_ordinal = true;
    },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => decodeInlineStringSources(encode(value)), /InvalidHwpxInlineStringSources/);
  }
  const bytes = encode(original);
  for (let end = 0; end < bytes.length; end++)
    assert.throws(
      () => decodeInlineStringSources(bytes.subarray(0, end)),
      /InvalidHwpxInlineStringSources/,
    );
  assert.deepEqual(
    decodeInlineStringSources(encode({ sourceOnly: true, controls: [], texts: [] })),
    { sourceOnly: true, controls: [], texts: [] },
  );
});
