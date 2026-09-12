const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const options: core.hwp5.chart_type_table.Options = .{
        .max_types = try input.readInt(u32),
        .max_name_bytes = try input.readInt(u32),
        .max_total_name_bytes = try input.readInt(u32),
    };
    const count = try input.readInt(u16);
    if (count > limit) return error.LimitExceeded;
    var offsets: core.Reader = .{ .bytes = try input.take(@as(usize, count) * 4) };
    const source = bytes[input.offset..];
    var table = core.hwp5.chart_type_table.Table.init(a, options);
    defer table.deinit();
    var rows: std.ArrayList(u8) = .empty;
    defer rows.deinit(a);
    for (0..count) |_| {
        var reader: core.Reader = .{ .bytes = source, .offset = try offsets.readInt(u32) };
        const value = try table.readObserved16(&reader);
        try int(a, &rows, u32, value.id);
        try int(a, &rows, u32, @intFromBool(value.introduced));
        try int(a, &rows, u32, @intCast(reader.offset));
        try int(a, &rows, u32, @intCast(value.declaration.raw_name.len));
        try int(a, &rows, u16, value.declaration.version);
        try rows.appendSlice(a, value.declaration.raw_name);
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, table.definitions.count());
    try int(a, &out, u32, @intCast(table.name_bytes));
    try out.appendSlice(a, rows.items);
    return out.toOwnedSlice(a);
}
