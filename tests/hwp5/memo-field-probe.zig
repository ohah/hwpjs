const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const h = try core.hwp5.body.ControlHeader.parse(bytes);
    const p = try core.hwp5.field_start.Properties.parse(h.properties);
    const reference = try core.hwp5.body.memo_field.fromField(h.id, p);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intFromBool(reference != null));
    if (reference) |r| {
        try int(a, &out, u32, @intFromBool(r.index != null));
        try int(a, &out, u32, r.index orelse 0);
        try int(a, &out, u32, @intCast(r.extra.len));
        try out.appendSlice(a, r.extra);
    }
    return out.toOwnedSlice(a);
}
