const std = @import("std");
const core = @import("hwpjs");
pub const Prefix = struct {
    previous: @import("chart-post-line-prefix.zig").Prefix,
    collection: core.hwp5.chart_series_collection.Collection,
    pub fn reader(self: *Prefix) *core.Reader {
        return self.previous.reader();
    }
    pub fn types(self: *Prefix) *core.hwp5.chart_type_table.Table {
        return self.previous.types();
    }
    pub fn objects(self: *Prefix) *core.hwp5.chart_object_table.Table {
        return self.previous.objects();
    }
    pub fn deinit(self: *Prefix) void {
        self.collection.deinit();
        self.previous.deinit();
        self.* = undefined;
    }
};
// Shared test-only selected counts and retained scope through the Title header.
pub fn read(a: std.mem.Allocator, bytes: []const u8, limit: usize) !Prefix {
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    const count = try input.readInt(u32);
    if (count > 16) return error.LimitExceeded;
    var counts: [16]usize = undefined;
    for (counts[0..count]) |*n| n.* = try input.readInt(u32);
    var prefix = try @import("chart-post-line-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    errdefer prefix.deinit();
    const collection = try core.hwp5.chart_series_collection.readObserved(a, prefix.reader(), prefix.types(), prefix.objects(), counts[0..count], .{});
    return .{ .previous = prefix, .collection = collection };
}
