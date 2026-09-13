const std = @import("std");
const records = @import("records.zig");
const color_ref = @import("color_ref.zig");

pub const Brush = struct {
    style_raw: u16,
    color: color_ref.ColorRef,
    hatch_raw: u16,
};

pub fn parse(record: records.Record, color_policy: color_ref.ReservedPolicy) !Brush {
    if (record.function != 0x02fc) return error.InvalidWmfBrushFunction;
    if (record.size_words != 7 or record.parameters.len != 8) return error.InvalidWmfBrushSize;
    const style = std.mem.readInt(u16, record.parameters[0..2], .little);
    if (style > 9) return error.UnsupportedWmfBrushStyle;
    const hatch = std.mem.readInt(u16, record.parameters[6..8], .little);
    if (style == 2 and hatch > 5) return error.UnsupportedWmfHatchStyle;
    return .{
        .style_raw = style,
        .color = try color_ref.parse(record.parameters[2..6], color_policy),
        .hatch_raw = hatch,
    };
}
