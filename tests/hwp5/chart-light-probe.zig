const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_sources = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-light-prefix.zig").read(a, bytes[input.offset..], limit, max_sources, max_objects);
    defer prefix.deinit();
    return serialize(a, prefix.light, prefix.previous.objects.entries.count());
}
pub fn serialize(a: std.mem.Allocator, value: core.hwp5.chart_light.Light, object_count: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.end, value.object_id, value.array.object_id, value.array.first_word, value.array.second_word, value.sources.len, object_count }) |field|
        try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, &value.raw);
    for (value.sources) |source| {
        inline for (.{ source.object_id, source.start, source.end }) |field| try int(a, &out, u32, @intCast(field));
        try out.appendSlice(a, &source.raw);
    }
    return out.toOwnedSlice(a);
}
