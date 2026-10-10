//! Current model UTF16 coordinate, not a source byte offset or display placeholder.
const std = @import("std");
pub fn read(p: @import("../../model/document.zig").Paragraph) !u32 {
    var unit: ?u32 = null;
    for (p.tokens) |token| {
        if (token.kind != .control or token.raw.len != 16) continue;
        if (std.mem.readInt(u16, token.raw[0..2], .little) != 2 or std.mem.readInt(u32, token.raw[2..6], .little) != @import("../body/column_def.zig").control_id) continue;
        if (unit != null) return error.AmbiguousColumnAnchor;
        unit = token.start_unit;
    }
    return unit orelse error.MissingColumnAnchor;
}
