const std = @import("std");
const records = @import("records.zig");
const color_ref = @import("color_ref.zig");

pub const Pen = struct {
    style_raw: u16,
    width_x: i16,
    width_y: i16,
    color: color_ref.ColorRef,
};

fn validStyle(raw: u16) bool {
    const base = raw & 0x000f;
    const end_cap = raw & 0x0f00;
    const join = raw & 0xf000;
    return base <= 8 and (end_cap == 0 or end_cap == 0x0100 or end_cap == 0x0200) and
        (join == 0 or join == 0x1000 or join == 0x2000) and (raw & 0x00f0) == 0;
}

pub fn parse(record: records.Record, color_policy: color_ref.ReservedPolicy) !Pen {
    if (record.function != 0x02fa) return error.InvalidWmfPenFunction;
    if (record.size_words != 8 or record.parameters.len != 10) return error.InvalidWmfPenSize;
    const style = std.mem.readInt(u16, record.parameters[0..2], .little);
    if (!validStyle(style)) return error.UnsupportedWmfPenStyle;
    return .{
        .style_raw = style,
        .width_x = std.mem.readInt(i16, record.parameters[2..4], .little),
        .width_y = std.mem.readInt(i16, record.parameters[4..6], .little),
        .color = try color_ref.parse(record.parameters[6..10], color_policy),
    };
}
