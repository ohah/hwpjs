const std = @import("std");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-footnote-prefix.zig").read(a, bytes, limit);
    defer prefix.deinit();
    const value = prefix.backdrop;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(value.end));
    for (value.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u16, value.fill_suffix);
    try out.appendSlice(a, &prefix.raw_grid_tail);
    try out.appendSlice(a, &value.raw_backdrop);
    try out.appendSlice(a, &value.raw_fill);
    try out.appendSlice(a, &value.raw_picture);
    return out.toOwnedSlice(a);
}
