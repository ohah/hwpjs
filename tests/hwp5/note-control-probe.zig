const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 2) return error.InvalidMode;
    const p = try core.hwp5.note_control.Properties.parse(bytes[r.offset..], @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (p.observed) |v| {
        try int(a, &out, u32, v.number);
        try int(a, &out, u16, v.prefix);
        try int(a, &out, u16, v.suffix);
        try int(a, &out, u32, v.number_shape);
        if (v.instance_id) |instance_id| try int(a, &out, u32, instance_id);
    } else try out.appendSlice(a, p.raw);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
