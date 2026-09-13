const std = @import("std");
const core = @import("hwpjs");
const previous = @import("chart-legend-prefix.zig");
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
    _ = try core.hwp5.chart_plot_prefix.readObservedEmptyArrayV4(reader, types, &prefix.objects);
    const value = try core.hwp5.chart_light.readObservedV1(a, reader, types, &prefix.objects, .{ .max_sources = max_sources });
    return .{ .previous = prefix, .light = value };
}
