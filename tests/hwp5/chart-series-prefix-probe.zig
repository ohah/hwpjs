const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-post-line-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    defer prefix.deinit();
    const p = try core.hwp5.chart_series_prefix.readObservedV2(prefix.reader(), prefix.types(), prefix.objects());
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ p.object_id, p.end, p.array.object_id, p.array.first_word, p.array.second_word, p.array.end, prefix.types().definitions.count(), prefix.objects().entries.count() }) |v| try int(a, &out, u32, @intCast(v));
    try out.appendSlice(a, &p.raw);
    return out.toOwnedSlice(a);
}
