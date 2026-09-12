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
    for (prefix.grid.cells) |cell| switch (cell.value) {
        .empty => {},
        .number => try objects.registerOther(cell.object_id.?),
        .string => |s| try objects.registerString(.{ .object_id = cell.object_id.?, .bytes = s.bytes, .trailer = s.trailer }),
    };
    for (prefix.backdrop.object_ids) |id| try objects.registerOther(id);
    for ([_]u32{ footnote.object_id, footnote.block.object_id, footnote.block.font.object_id } ++ footnote.section.backdrop.object_ids) |id|
        try objects.registerOther(id);
    try objects.registerString(footnote.block.font.name);
    try objects.registerString(footnote.block.text);
    const value = try core.hwp5.chart_legend.readObservedV1(&prefix.reader, &prefix.grid.prelude.types, &objects, max_name);
    return .{ .previous = prefix, .objects = objects, .legend = value };
}
