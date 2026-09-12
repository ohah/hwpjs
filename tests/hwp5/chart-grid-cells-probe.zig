const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var reader: core.Reader = .{ .bytes = bytes };
    const max_string = try reader.readInt(u32);
    const max_total = try reader.readInt(u32);
    const max_cells = try reader.readInt(u32);
    const max_types = try reader.readInt(u32);
    var value = try core.hwp5.chart_grid_cells.readObservedV6(a, bytes[reader.offset..], .{
        .max_string_bytes = max_string,
        .max_total_string_bytes = max_total,
        .prelude = .{ .max_bytes = limit, .max_cells = max_cells, .types = .{ .max_types = max_types } },
    });
    defer value.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ value.prelude.rows, value.prelude.columns, value.cells.len, value.payload_offset, value.prelude.types.definitions.count(), value.string_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    for (value.cells) |cell| {
        try int(a, &out, u32, cell.object_id orelse 0xffffffff);
        try int(a, &out, u32, switch (cell.value) {
            .empty => 0,
            .string => 1,
            .number => 2,
        });
        try int(a, &out, u32, @intCast(cell.start));
        try int(a, &out, u32, @intCast(cell.end));
        try int(a, &out, u32, switch (cell.value) {
            .empty => 0,
            .string => |s| s.trailer,
            .number => |n| n.trailer,
        });
        try int(a, &out, u32, switch (cell.value) {
            .empty => 0,
            .string => |s| @intCast(s.bytes.len),
            .number => 8,
        });
        switch (cell.value) {
            .empty => {},
            .string => |s| try out.appendSlice(a, s.bytes),
            .number => |n| try int(a, &out, u64, n.bits),
        }
    }
    return out.toOwnedSlice(a);
}
