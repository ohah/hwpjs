const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig");
const labels = @import("series_label.zig");
const points = @import("series_point.zig");
pub const Options = struct {
    max_points: usize = 65535,
    text: labels.Options = .{},
};
pub const Section = struct {
    points: []points.Point,
    raw: [66]u8,
    text: Objects.Reference,
    label: labels.Label,
    end: usize,
    allocator: std.mem.Allocator,
    pub fn deinit(self: *Section) void {
        self.allocator.free(self.points);
        self.* = undefined;
    }
};

/// Explicit caller-selected Point count; no Array word interpretation. Owns
/// only the Point slice. Strings borrow input. Failure preserves reader but
/// requires discarding both tables, including after allocation failure.
pub fn readObserved(a: std.mem.Allocator, reader: *Reader, types: *Types, objects: *Objects.Table, count: usize, options: Options) !Section {
    if (count > options.max_points) return error.LimitExceeded;
    var next = reader.*;
    const items = try a.alloc(points.Point, count);
    errdefer a.free(items);
    for (items) |*item| item.* = try points.readObservedV1(&next, types, objects, options.text);
    const raw = (try next.take(66))[0..66].*;
    const text = try objects.readStringObservedV1(&next, types, options.text.max_string_bytes);
    const label = try labels.readObservedV1(&next, types, objects, options.text);
    reader.* = next;
    return .{ .points = items, .raw = raw, .text = text, .label = label, .end = next.offset, .allocator = a };
}
