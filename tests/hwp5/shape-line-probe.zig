const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.shape_line.Line.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ "start_x", "start_y", "end_x", "end_y" }) |f| try int(a, &out, i32, @field(p, f));
    try int(a, &out, u16, p.attributes);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
