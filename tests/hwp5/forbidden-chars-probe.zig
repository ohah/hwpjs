const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.forbidden_chars.Lists.parseObserved(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (p.lists) |list| {
        try int(a, &out, u32, @intCast(list.len / 2));
        try out.appendSlice(a, list);
    }
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
