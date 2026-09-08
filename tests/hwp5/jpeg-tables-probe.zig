const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const maximum = try r.readInt(u16);
    const symbols = try r.readInt(u16);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, 0);
    var count: usize = 0;
    if (mode == 0) {
        var it = try core.image.jpeg_quantization.Iterator.init(bytes[r.offset..], .{ .max_bytes = limit, .max_tables = maximum });
        while (try it.next()) |table| {
            for ([_]usize{ table.destination, table.precision, 64 }) |n| try int(a, &out, u32, @intCast(n));
            for (0..64) |i| try int(a, &out, u16, table.value(i).?);
        }
        count = it.cursor.count;
    } else {
        var it = try core.image.jpeg_huffman.Iterator.init(bytes[r.offset..], .{ .cursor = .{ .max_bytes = limit, .max_tables = maximum }, .max_symbols = symbols });
        while (try it.next()) |table| {
            for ([_]usize{ table.destination, table.class, table.symbols.len, table.unused_code_slots, @intFromBool(table.symbol_semantics_deferred) }) |n| try int(a, &out, u32, @intCast(n));
            try out.appendSlice(a, table.bits);
            try out.appendSlice(a, table.symbols);
        }
        count = it.cursor.count;
    }
    std.mem.writeInt(u32, out.items[0..4], @intCast(count), .little);
    return out.toOwnedSlice(a);
}
