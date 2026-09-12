const std = @import("std");
const core = @import("hwpjs");
const previous = @import("chart-legend-prefix.zig");
const requireType = core.hwp5.chart_type_checks.require;
pub const Prefix = struct {
    previous: previous.Prefix,
    light: core.hwp5.chart_light.Light,
    pub fn deinit(self: *Prefix) void {
        self.light.deinit();
        self.previous.deinit();
        self.* = undefined;
    }
};
/// Private selected Plot prefix and Light, not general Plot routing.
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize, max_sources: usize, max_objects: usize) !Prefix {
    var prefix = try @import("chart-legend-prefix.zig").read(a, contents, limit, 65535, max_objects, 16 * 1024 * 1024);
    errdefer prefix.deinit();
    const reader = &prefix.previous.reader;
    const types = &prefix.previous.grid.prelude.types;
    // Private observed Plot prefix only, not a complete Plot parser.
    try prefix.objects.registerOther(try reader.readInt(u32));
    try requireType(types, reader, "VtChartPlot\x00", 4);
    const initial = try core.hwp5.chart_array_header.readObservedV1(reader, types, &prefix.objects);
    if (try initial.observedEqualCount(65535) != 0) return error.UnsupportedChartInitialArray;
    _ = try reader.take(136);
    const value = try core.hwp5.chart_light.readObservedV1(a, reader, types, &prefix.objects, .{ .max_sources = max_sources });
    return .{ .previous = prefix, .light = value };
}
