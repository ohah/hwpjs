const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.page_number.Properties.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.attributes);
    for ([_]u16{ p.symbol, p.prefix, p.suffix, p.dash }) |n| try int(a, &out, u16, n);
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
