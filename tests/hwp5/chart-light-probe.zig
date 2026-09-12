const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const requireType = core.hwp5.chart_type_checks.require;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_sources = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    var prefix = try @import("chart-legend-prefix.zig").read(a, bytes[input.offset..], limit, 65535, max_objects, 16 * 1024 * 1024);
    defer prefix.deinit();
    const reader = &prefix.previous.reader;
    const types = &prefix.previous.grid.prelude.types;
    // Private observed Plot prefix only, not a complete Plot parser.
    try prefix.objects.registerOther(try reader.readInt(u32));
    try requireType(types, reader, "VtChartPlot\x00", 4);
    const initial = try core.hwp5.chart_array_header.readObservedV1(reader, types, &prefix.objects);
    if (try initial.observedEqualCount(65535) != 0) return error.UnsupportedChartInitialArray;
    _ = try reader.take(136);
    var value = try core.hwp5.chart_light.readObservedV1(a, reader, types, &prefix.objects, .{ .max_sources = max_sources });
    defer value.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.end, value.object_id, value.array.object_id, value.array.first_word, value.array.second_word, value.sources.len, prefix.objects.entries.count() }) |field|
        try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, &value.raw);
    for (value.sources) |source| {
        inline for (.{ source.object_id, source.start, source.end }) |field| try int(a, &out, u32, @intCast(field));
        try out.appendSlice(a, &source.raw);
    }
    return out.toOwnedSlice(a);
}
