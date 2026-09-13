const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const series = @import("series.zig");
const titles = @import("title_header.zig");
pub const Options = struct { max_series: usize = 65535, series: series.Options = .{} };
/// Shared allocation-free preflight for a caller-selected Series layout.
pub fn validateCounts(point_counts: []const usize, options: Options) !void {
    if (point_counts.len > options.max_series) return error.LimitExceeded;
    for (point_counts) |n| if (n > options.series.section.max_points) return error.LimitExceeded;
}
pub const Collection = struct {
    items: []series.Series,
    title: titles.Header,
    end: usize,
    allocator: std.mem.Allocator,
    pub fn deinit(self: *Collection) void {
        for (self.items) |*item| item.deinit();
        self.allocator.free(self.items);
        self.* = undefined;
    }
};

/// Explicit caller-selected count per Series; no universal Array policy or
/// resynchronization. Stops after the following Title header. Owns items and
/// their Point slices. Failure preserves reader, frees partial results and
/// requires disposal of both tables. All String input must remain alive.
pub fn readObserved(a: std.mem.Allocator, reader: *Reader, types: *Types, objects: *Objects, point_counts: []const usize, options: Options) !Collection {
    try validateCounts(point_counts, options);
    var next = reader.*;
    const items = try a.alloc(series.Series, point_counts.len);
    var initialized: usize = 0;
    errdefer {
        for (items[0..initialized]) |*item| item.deinit();
        a.free(items);
    }
    for (items, point_counts) |*item, n| {
        item.* = try series.readObservedV2(a, &next, types, objects, n, options.series);
        initialized += 1;
    }
    const title = try titles.readObservedV1(&next, types, objects);
    reader.* = next;
    return .{ .items = items, .title = title, .end = next.offset, .allocator = a };
}
