const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.memo_shape.Shape.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.width);
    try int(a, &out, u8, p.border.kind);
    try int(a, &out, u8, p.border.width);
    for ([_]u32{ p.border.color, p.fill_color, p.active_color, p.unknown_raw, @intCast(p.extra.len) }) |v| try int(a, &out, u32, v);
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
