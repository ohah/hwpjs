const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const prelude = @import("grid_prelude.zig");
const values = @import("cell_value.zig");
const requireType = @import("type_checks.zig").require;

pub const Options = struct {
    prelude: prelude.Options = .{},
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 16 * 1024 * 1024,
};
pub const Cell = struct {
    object_id: ?u32,
    start: usize,
    end: usize,
    value: values.Value,
};
pub const Grid = struct {
    allocator: std.mem.Allocator,
    prelude: prelude.Prelude,
    cells: []Cell,
    string_bytes: usize,
    payload_offset: usize,
    pub fn deinit(self: *Grid) void {
        self.allocator.free(self.cells);
        self.prelude.deinit();
        self.* = undefined;
    }
};

/// Explicit observed inline-cell layout. Owns cells and type names, but string
/// payloads borrow Contents. Array position (including nulls), NOT object ID,
/// determines row/column. Leaves the rest of the grid object unread.
pub fn readObservedV6(a: std.mem.Allocator, bytes: []const u8, options: Options) !Grid {
    var head = try prelude.readObservedV6(a, bytes, options.prelude);
    errdefer head.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = head.payload_offset };
    var cells: std.ArrayList(Cell) = .empty;
    errdefer cells.deinit(a);
    var objects: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer objects.deinit(a);
    var string_bytes: usize = 0;
    const count = @as(usize, head.rows) * head.columns;
    for (0..count) |_| {
        const start = reader.offset;
        const id = try reader.readInt(u32);
        if (id == 0xffffffff) {
            try cells.append(a, .{ .object_id = null, .start = start, .end = reader.offset, .value = .empty });
            continue;
        }
        // Repeated object references need a separate graph contract, not an
        // unconditional inline payload read or an invented blank cell.
        const object = try objects.getOrPut(a, id);
        if (object.found_existing) return error.UnsupportedChartObjectReference;
        const reference = try head.types.readObserved16(&reader);
        if (reference.declaration.version != 1) return error.UnsupportedChartTypeVersion;
        const value = try values.read(&reader, reference.declaration.raw_name, @min(options.max_string_bytes, options.max_total_string_bytes - string_bytes));
        switch (value) {
            .string => |s| string_bytes += s.bytes.len,
            else => {},
        }
        try requireType(&head.types, &reader, "VtValue\x00", 1);
        try requireType(&head.types, &reader, "VtObject\x00", 1);
        try cells.append(a, .{ .object_id = id, .start = start, .end = reader.offset, .value = value });
    }
    return .{ .allocator = a, .prelude = head, .cells = try cells.toOwnedSlice(a), .string_bytes = string_bytes, .payload_offset = reader.offset };
}
