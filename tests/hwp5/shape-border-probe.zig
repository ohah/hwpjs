const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const p = try core.hwp5.shape_border.Border.parse(bytes[r.offset..], @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.value.color);
    if (mode == 0) try int(a, &out, i16, @intCast(p.value.width)) else try int(a, &out, i32, p.value.width);
    try int(a, &out, u32, p.value.attributes.raw);
    try int(a, &out, u8, p.value.outline);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
