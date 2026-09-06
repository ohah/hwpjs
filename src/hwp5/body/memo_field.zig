const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const id = @import("control_rules.zig").id;
const Properties = @import("field_start.zig").Properties;
pub fn isCommand(command: []const u8) bool {
    return std.mem.startsWith(u8, command, "M\x00E\x00M\x00O\x00/\x00");
}
pub const Reference = struct { index: ?u32, extra: []const u8 };
/// Reuses the parsed common field envelope. Absence is not memo index zero.
/// Unknown field kinds are not reclassified by a loose prefix/wildcard.
pub fn fromField(control_id: u32, field: Properties) !?Reference {
    if (control_id != id("%%me") and !(control_id == id("%unk") and isCommand(field.command))) return null;
    if (field.extra.len == 0) return .{ .index = null, .extra = field.extra };
    var r: Reader = .{ .bytes = field.extra };
    return .{ .index = try r.readInt(u32), .extra = field.extra[r.offset..] };
}
