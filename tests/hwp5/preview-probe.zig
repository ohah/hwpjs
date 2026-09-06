const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const parsed = try core.hwp5.preview_text.Text.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(parsed.stats))) |f| try int(a, &out, u32, @intCast(@field(parsed.stats, f.name)));
    try out.appendSlice(a, parsed.raw);
    return out.toOwnedSlice(a);
}
