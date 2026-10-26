import { validTableImageTone } from "./table-image-tone.mjs";
export const TABLE_IMAGE_MODES = Object.freeze([
  "TILE",
  "TILE_HORZ_TOP",
  "TILE_HORZ_BOTTOM",
  "TILE_VERT_LEFT",
  "TILE_VERT_RIGHT",
  "TOTAL",
  "CENTER",
  "CENTER_TOP",
  "CENTER_BOTTOM",
  "LEFT_CENTER",
  "LEFT_TOP",
  "LEFT_BOTTOM",
  "RIGHT_CENTER",
  "RIGHT_TOP",
  "RIGHT_BOTTOM",
  "ZOOM",
]);
export function validTableImageFill(fill) {
  return (
    fill?.state === "image" &&
    TABLE_IMAGE_MODES.includes(fill.mode) &&
    typeof fill.resourceId === "string" &&
    fill.resourceId.length > 0 &&
    (fill.tone === undefined || validTableImageTone(fill.tone))
  );
}

// Header source selection is verified upstream; image children retain exact ancestry.
export function selectedTableImageFill(selected) {
  const fail = () => ({ state: "unavailable", error: "UnsupportedTableImageFill" });
  if (selected?.state !== "selected") return fail();
  const { brush, nodes, report } = selected;
  if (
    brush?.direct_children !== 1 ||
    brush.other_attributes !== 0 ||
    !Array.isArray(nodes) ||
    nodes.length !== 2
  )
    return fail();
  const root = nodes[0],
    image = nodes[1];
  if (!root || !image || !Array.isArray(root.raw) || !Array.isArray(image.raw)) return fail();
  if (
    root.kind !== "img_brush" ||
    root.parent_node_index !== null ||
    root.direct_children !== 1 ||
    root.other_attributes !== 0 ||
    root.unknown_enums !== 0 ||
    image.kind !== "image" ||
    image.direct_children !== 0 ||
    image.other_attributes !== 0 ||
    image.unknown_enums !== 0 ||
    image.parent_node_index === null ||
    report?.nodes?.[image.parent_node_index] !== root ||
    root.brush_index !== image.brush_index ||
    !["0", "10"].includes(image.raw[15]) ||
    image.raw[16] !== "0" ||
    !(image.raw[17] === "REAL_PIC" || (image.raw[17] === "GRAY_SCALE" && image.raw[15] === "0")) ||
    image.raw[18] !== "0"
  )
    return fail();
  const fill = {
    state: "image",
    mode: root.raw[12],
    resourceId: image.raw[14],
    rasterParity: "unverified",
    ...(image.raw[17] === "GRAY_SCALE"
      ? { tone: "grayscale601" }
      : image.raw[15] === "10"
        ? { tone: "brightness10" }
        : {}),
  };
  return validTableImageFill(fill) ? fill : fail();
}

// Intrinsic bitmap sizes use Canvas logical pixels; callers own source clipping/transforms.
export function paintTableImageFill(ctx, bitmap, box, fill, scrollTop) {
  if (
    !validTableImageFill(fill) ||
    !bitmap ||
    ![bitmap.width, bitmap.height].every((n) => Number.isSafeInteger(n) && n > 0) ||
    !box ||
    ![box.x, box.y, box.width, box.height, scrollTop, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) ||
    box.width <= 0 ||
    box.height <= 0
  )
    return false;
  const x = box.x,
    y = box.y - scrollTop,
    w = box.width,
    h = box.height,
    iw = bitmap.width,
    ih = bitmap.height,
    mode = fill.mode;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (mode === "TOTAL") {
      ctx.drawImage(bitmap, x, y, w, h);
      return true;
    }
    if (mode === "ZOOM") {
      const scale = Math.min(w / iw, h / ih),
        width = iw * scale,
        height = ih * scale;
      ctx.drawImage(bitmap, x + (w - width) / 2, y + (h - height) / 2, width, height);
      return true;
    }
    if (mode.startsWith("TILE")) {
      const horizontal = mode.startsWith("TILE_HORZ"),
        vertical = mode.startsWith("TILE_VERT");
      const pattern = ctx.createPattern(
        bitmap,
        horizontal ? "repeat-x" : vertical ? "repeat-y" : "repeat",
      );
      if (!pattern) return false;
      const ox = mode === "TILE_VERT_RIGHT" ? w - iw : 0,
        oy = mode === "TILE_HORZ_BOTTOM" ? h - ih : 0;
      ctx.translate(x + ox, y + oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(-ox, -oy, w, h);
      return true;
    }
    const horizontal = mode.startsWith("LEFT_")
      ? 0
      : mode.startsWith("RIGHT_")
        ? w - iw
        : (w - iw) / 2;
    const vertical = mode.endsWith("_TOP") ? 0 : mode.endsWith("_BOTTOM") ? h - ih : (h - ih) / 2;
    ctx.drawImage(bitmap, x + horizontal, y + vertical, iw, ih);
    return true;
  } finally {
    ctx.restore();
  }
}
