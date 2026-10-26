import { validateHwp5FormSources, validateHwp5FormAnchors } from "../../js/hwp5-form-sources.mjs";
import { validateHwp5FormProperties } from "../../js/hwp5-form-properties.mjs";
import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { colorrefCss } from "./colorref-css.mjs";
import { createTextStyle } from "./text-style.mjs";
import { FONT } from "./layout.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";
export const formPositionKey = (section, paragraph, unit) => `${section}:${paragraph}:${unit}`;

/** Source-sized static preview only. Native owns values; no event is executed. */
export function inlineHwp5FormIndex(content, { draft } = {}) {
  const result = new Map(),
    fontAt = createTextStyle(content, FONT),
    paragraphs = new Map();
  result.unavailable = [];
  for (const p of content.paragraphs) {
    const key = `${p.section}:${p.paragraph}`;
    paragraphs.set(key, paragraphs.has(key) ? null : p);
  }
  for (const form of content.hwp5Forms ?? []) {
    try {
      validateHwp5FormSources([form.source]);
      validateHwp5FormAnchors([form.anchor]);
      validateHwp5FormProperties([form.properties]);
      const source = form.source,
        flags = hwp5ObjectFlags(source.flags),
        p = paragraphs.get(`${form.section}:${form.paragraph}`);
      if (
        !Number.isInteger(form.section) ||
        form.section < 0 ||
        form.section > 0xffffffff ||
        form.controlNode !== source.control_node ||
        form.formNode !== source.object_node ||
        form.anchor.control_node !== source.control_node ||
        form.anchor.object_node !== source.object_node ||
        form.anchor.source_unit !== source.source_unit ||
        form.anchor.paragraph !== form.paragraph
      )
        throw Error("MismatchedFormDisplayAnchor");
      if (
        !p ||
        p.clipped ||
        p.text[form.anchorUnit] !== "\ufffc" ||
        (draft?.section === form.section && draft?.paragraph === form.paragraph)
      )
        throw Error("UnconfirmedFormDisplayAnchor");
      if (
        sourceDisplayPosition(form.anchor.current_unit, p.sourceOffsets, p.text.length) !==
          form.anchorUnit ||
        sourceDisplayPosition(form.anchor.current_unit + 8, p.sourceOffsets, p.text.length) !==
          form.anchorUnit + 1
      )
        throw Error("MismatchedFormDisplayAnchor");
      if (
        !["edit", "combo_box", "push_button", "check_box", "radio_button"].includes(source.kind) ||
        !flags.treat_as_character ||
        flags.width_relative !== 4 ||
        flags.height_relative !== 2 ||
        source.width === 0 ||
        source.height === 0 ||
        source.offset_x !== 0 ||
        source.offset_y !== 0 ||
        source.margins.some((v) => v !== 0) ||
        source.common_extra_bytes ||
        source.envelope_extra_bytes ||
        source.other_direct_children ||
        flags.has_caption
      )
        throw Error("UnsupportedFormPreviewGeometry");
      if (
        form.properties.control_node !== source.control_node ||
        form.properties.object_node !== source.object_node ||
        form.properties.known_nodes + form.properties.deferred_nodes !== source.property_nodes
      )
        throw Error("MismatchedFormPreviewProperties");
      const fields = new Map(form.properties.fields.map((f) => [f.field, f]));
      const text = (name, kind) => {
        const f = fields.get(name);
        if (!f || f.kind !== kind || f.units.length > 4096)
          throw Error("UnsupportedFormPreviewProperty");
        const value = String.fromCharCode(...f.units);
        if (!value.isWellFormed() || value.includes("\0"))
          throw Error("UnsupportedFormPreviewText");
        return value;
      };
      const number = (name, kind = "integer", max = 0xffffffff) => {
        const raw = text(name, kind),
          value = Number(raw);
        if (!/^[0-9]+$/.test(raw) || !Number.isInteger(value) || value < 0 || value > max)
          throw Error("UnsupportedFormPreviewNumber");
        return value;
      };
      const sourceAutoSize = number("auto_size", "boolean", 1) === 1;
      // Radio selection never edits Caption; retain the source box explicitly
      // rather than pretending current font metrics reproduce AutoSize.
      if (
        (sourceAutoSize && source.kind !== "radio_button") ||
        number("word_wrap", "boolean", 1) !== 0
      )
        throw Error("UnsupportedFormPreviewAutosize");
      const follow = number("follow_context", "boolean", 1),
        id = number("char_shape_id");
      if (!follow && !content.characterShapes?.some((s) => s.id === id && s.height > 0))
        throw Error("MissingFormPreviewFont");
      const label = text(
        ["push_button", "check_box", "radio_button"].includes(source.kind) ? "caption" : "text",
        "wstring",
      );
      if (/[\r\n]/.test(label)) throw Error("UnsupportedFormPreviewText");
      if (
        source.kind === "edit" &&
        (text("password_char", "wstring") !== "" ||
          number("multi_line", "boolean", 1) !== 0 ||
          number("align_text") !== 0)
      )
        throw Error("UnsupportedFormPreviewEditMode");
      const foreground = colorrefCss(number("fore_color")),
        background = colorrefCss(number("back_color"));
      if (!foreground || !background) throw Error("UnsupportedFormPreviewColor");
      const font = follow
        ? fontAt(p, form.anchorUnit)
        : fontAt(
            {
              text: label,
              characterRanges: [{ start: 0, end: Math.max(1, label.length), charShapeId: id }],
            },
            0,
          );
      let checkBox = null;
      if (source.kind === "check_box" || source.kind === "radio_button") {
        const radio = source.kind === "radio_button";
        const state = number("value", "integer", radio ? 1 : 2),
          triState = number("tri_state", "boolean", 1) === 1;
        if (state === 2 && !triState) throw Error("UnsupportedFormPreviewChoiceState");
        // Only the observed opaque style has a paint contract here.
        if (number("back_style") !== 1) throw Error("UnsupportedFormPreviewBackStyle");
        const available = radio
          ? content.hwp5RadioSelectAvailable === true &&
            (text("radio_group_name", "wstring").length > 0 ||
              content.hwp5UnnamedRadioSelectAvailable === true)
          : content.hwp5CheckBoxStateEditAvailable === true;
        checkBox = {
          kind: source.kind,
          section: form.section,
          formNode: form.formNode,
          caption: label,
          state: ["UNCHECKED", "CHECKED", "INDETERMINATE"][state],
          triState,
          editable:
            available &&
            number("enabled", "boolean", 1) === 1 &&
            number("editable", "boolean", 1) === 1,
          foreColor: foreground,
          backColor: background,
          backStyle: "OPAQUE",
        };
      }
      const key = formPositionKey(form.section, form.paragraph, form.anchorUnit);
      if (result.has(key)) {
        result.set(key, null);
        throw Error("AmbiguousFormPreviewAnchor");
      }
      result.set(key, {
        form,
        label,
        font,
        foreground,
        background,
        checkBox,
        sourceAutoSize,
        drawFrame: number("draw_frame", "boolean", 1) === 1,
        width: hwpUnitPixels(source.width),
        height: hwpUnitPixels(source.height),
        affectLineSpacing: flags.affect_line_spacing,
        readOnly: true,
      });
    } catch (error) {
      result.unavailable.push({
        section: form.section,
        formNode: form.formNode,
        error: error.message,
      });
    }
  }
  return result;
}
