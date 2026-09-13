const std = @import("std");
const core = @import("hwpjs");
const previous = @import("chart-footnote-prefix.zig");
pub const Prefix = struct {
    previous: previous.Prefix,
    objects: core.hwp5.chart_object_table.Table,
    legend: core.hwp5.chart_legend.Legend,
    pub fn deinit(self: *Prefix) void {
        self.objects.deinit();
        self.previous.deinit();
        self.* = undefined;
    }
};
/// Shared established object scope; does not guess opaque prefix IDs.
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize, max_name: usize, max_objects: usize, max_stored: usize) !Prefix {
    var prefix = try @import("chart-footnote-prefix.zig").read(a, contents, limit);
    errdefer prefix.deinit();
    const footnote = try core.hwp5.chart_footnote.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, .{});
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects, .max_total_string_bytes = max_stored });
    errdefer objects.deinit();
    // Only established objects are registered; opaque root/grid prefix words
    // are not guessed to be object IDs. Caller retains the complete Contents.
    try core.hwp5.chart_initial_objects.register(&objects, prefix.grid, prefix.backdrop, footnote);
    const value = try core.hwp5.chart_legend.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, &objects, max_name);
    return .{ .previous = prefix, .objects = objects, .legend = value };
}
