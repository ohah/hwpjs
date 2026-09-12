const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const arrays = @import("array_header.zig");
const sources = @import("light_source.zig");
pub const Options = struct { max_sources: usize = 65535 };
pub const Light = struct {
    allocator: std.mem.Allocator,
    object_id: u32,
    array: arrays.Header,
    sources: []sources.Source,
    raw: [10]u8,
    end: usize,
    pub fn deinit(self: *Light) void {
        self.allocator.free(self.sources);
        self.* = undefined;
    }
};

/// Explicit equal-word inline VtLight3 v1 layout. Owns the source list and
/// copies raw fields. Reader commits only after final allocation succeeds;
/// any failure requires disposal of both caller-owned tables.
pub fn readObservedV1(a: std.mem.Allocator, reader: *Reader, types: *Types, objects: *Objects, options: Options) !Light {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtLight3\x00", 1);
    const array = try arrays.readObservedV1(&next, types, objects);
    const count = try array.observedEqualCount(options.max_sources);
    var list: std.ArrayList(sources.Source) = .empty;
    errdefer list.deinit(a);
    for (0..count) |_| try list.append(a, try sources.readObservedV1(&next, types, objects));
    const raw = (try next.take(10))[0..10].*;
    try requireType(types, &next, "VtObject\x00", 1);
    const owned = try list.toOwnedSlice(a);
    reader.* = next;
    return .{ .allocator = a, .object_id = id, .array = array, .sources = owned, .raw = raw, .end = next.offset };
}
