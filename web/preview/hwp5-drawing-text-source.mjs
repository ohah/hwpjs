import { validateHwp5DrawingListSources } from "../../js/hwp5-drawing-list-sources.mjs";

// Shared conversion of an explicitly owned body list; captions have another layout.
export function hwp5DrawingTextSource(source) {
  validateHwp5DrawingListSources([source]);
  if (source.kind !== "body") throw new Error("UnsupportedHwp5DrawingTextList");
  if ((source.attributes & ~0x7f) !== 0) throw new Error("UnsupportedHwp5DrawingTextAttributes");
  return {
    list_node: source.list_node,
    text_direction: source.attributes & 7,
    line_wrap: (source.attributes >>> 3) & 3,
    vertical_alignment: (source.attributes >>> 5) & 3,
    margin_present: true,
    margins: [...source.margins],
    extra_bytes: source.body_extra_bytes,
  };
}
