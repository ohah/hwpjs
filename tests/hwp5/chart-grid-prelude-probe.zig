const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const options: core.hwp5.chart_grid_prelude.Options = .{
        .types = .{
            .max_types = try input.readInt(u32),
            .max_name_bytes = try input.readInt(u32),
            .max_total_name_bytes = try input.readInt(u32),
        },
        .max_cells = try input.readInt(u32),
        .max_bytes = limit,
    };
    var value = try core.hwp5.chart_grid_prelude.readObservedV6(a, bytes[input.offset..], options);
    defer value.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &value.prefix);
    inline for (.{ value.root_prefix, value.grid_prefix, value.collection_prefix, value.rows, value.columns, value.payload_offset, value.types.definitions.count(), value.types.name_bytes }) |field|
        try int(a, &out, u32, @intCast(field));
    return out.toOwnedSlice(a);
}
