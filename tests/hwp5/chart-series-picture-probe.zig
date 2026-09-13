const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-suffix-prefix.zig").read(a, bytes, limit);
    defer prefix.deinit();
    const value = try core.hwp5.chart_series_picture.readObserved(prefix.reader(), prefix.types(), prefix.objects());
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.picture.object_id, value.picture.body.end, value.picture.end, value.end, prefix.types().definitions.count(), prefix.objects().entries.count() }) |v| try int(a, &out, u32, @intCast(v));
    try out.appendSlice(a, &value.raw);
    try out.appendSlice(a, &value.picture.body.raw);
    return out.toOwnedSlice(a);
}
