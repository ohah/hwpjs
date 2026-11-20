//! Official table6 eight-unit extended anchor, shared object control ID rules.
const std = @import("std");
const rules = @import("control_rules.zig");
pub fn create(control_id: u32) ![16]u8 {
    if (!@import("object_common.zig").supports(control_id)) return error.UnsupportedObjectAnchor;
    const code = rules.expectedCode(control_id) orelse return error.UnsupportedObjectAnchor;
    if (code != 11) return error.UnsupportedObjectAnchor;
    var bytes: [16]u8 = @splat(0);
    std.mem.writeInt(u16, bytes[0..2], code, .little);
    std.mem.writeInt(u32, bytes[2..6], control_id, .little);
    std.mem.writeInt(u16, bytes[14..16], code, .little);
    return bytes;
}
