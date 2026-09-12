const std = @import("std");
const core = @import("hwpjs");
const previous = @import("chart-line-items-prefix.zig");
pub const Prefix = struct {
    previous: previous.Prefix,
    block: core.hwp5.chart_post_line.Block,
    pub fn reader(self: *Prefix) *core.Reader {
        return &self.previous.previous.previous.previous.previous.reader;
    }
    pub fn types(self: *Prefix) *core.hwp5.chart_type_table.Table {
        return &self.previous.previous.previous.previous.previous.grid.prelude.types;
    }
    pub fn objects(self: *Prefix) *core.hwp5.chart_object_table.Table {
        return &self.previous.previous.previous.previous.objects;
    }
    pub fn deinit(self: *Prefix) void {
        self.previous.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize, max_objects: usize) !Prefix {
    var prefix = try previous.read(a, contents, limit, max_objects);
    errdefer prefix.deinit();
    const reader = &prefix.previous.previous.previous.previous.reader;
    const types = &prefix.previous.previous.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.previous.previous.objects;
    // Two selected corpus items, not a product count rule.
    for (0..2) |_| _ = try core.hwp5.chart_line_item.readObservedV1(reader, types, objects);
    const block = try core.hwp5.chart_post_line.readObserved(reader, types, objects);
    return .{ .previous = prefix, .block = block };
}
