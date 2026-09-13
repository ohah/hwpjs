const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-collection-prefix.zig").read(a, bytes, limit);
    defer prefix.deinit();
    _ = try core.hwp5.chart_title.readBodyObservedV1(prefix.reader(), prefix.types(), prefix.objects(), .{});
    const value = try core.hwp5.chart_tail.readObservedNoItems(prefix.reader(), prefix.types(), prefix.objects());
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.end, prefix.types().definitions.count(), prefix.objects().entries.count(), value.list.object_id, value.list.end }) |v| try int(a, &out, u32, @intCast(v));
    try int(a, &out, u16, value.list.collection.raw_word);
    try out.appendSlice(a, &value.raw);
    try int(a, &out, u16, value.window.raw_word);
    return out.toOwnedSlice(a);
}
