const std = @import("std");
const core = @import("hwpjs");
const previous = @import("chart-light-prefix.zig");
pub const Prefix = struct {
    previous: previous.Prefix,
    axis: core.hwp5.chart_axis.NullableTitleAxis,
    pub fn deinit(self: *Prefix) void {
        self.previous.deinit();
        self.* = undefined;
    }
};
// Selected corpus prefix, not complete Surface/Chart routing.
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize, per: usize, total: usize, max_objects: usize, stored: usize) !Prefix {
    if (contents.len > limit) return error.LimitExceeded;
    var prefix = try @import("chart-light-prefix.zig").read(a, contents, limit, 65535, max_objects);
    errdefer prefix.deinit();
    const reader = &prefix.previous.previous.reader;
    const types = &prefix.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.objects;
    if (objects.string_bytes > stored) return error.LimitExceeded;
    objects.options.max_total_string_bytes = stored;
    // Selected corpus prefix only, not a product four-axis/Surface contract.
    for (0..4) |_| _ = try core.hwp5.chart_axis.readObservedV3(reader, types, objects, .{});
    _ = try core.hwp5.chart_surface_prefix.readObservedEmptyArrayV1(reader, types, objects);
    const axis = try core.hwp5.chart_axis.readNullableTitleObservedV3(reader, types, objects, .{ .max_string_bytes = per, .max_total_string_bytes = total });
    return .{ .previous = prefix, .axis = axis };
}
