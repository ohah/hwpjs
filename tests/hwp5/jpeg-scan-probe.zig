const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

fn field(r: *core.Reader) ![]const u8 {
    const length = try r.readInt(u16);
    return r.take(length);
}

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const code = try r.readInt(u8);
    const height = try r.readInt(u16);
    const interval = try r.readInt(u16);
    const maximum = try r.readInt(u32);
    const restarts = try r.readInt(u32);
    const frame = try core.image.jpeg_frame.parse(code, try field(&r), .{});
    var store: core.image.jpeg_table_store.Store = .{};
    try store.installQuantization(try field(&r), .{});
    try store.installHuffman(try field(&r), .{});
    const scan = try field(&r);
    var decoder = try core.image.jpeg_sequential_scan.Decoder.init(frame, scan, &store, height, interval, bytes[r.offset..], .{ .max_bytes = limit, .max_blocks = maximum, .max_restarts = restarts });
    if (limit < 24 or decoder.layout.blocks > (limit - 24) / 272) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ decoder.layout.columns, decoder.layout.rows, @intCast(decoder.layout.count), @intCast(decoder.layout.blocks), 0, 0 }) |n| try int(a, &out, u32, n);
    while (try decoder.next()) |block| {
        for ([_]u32{ block.component_id, @intCast(block.frame_component), block.x, block.y }) |n| try int(a, &out, u32, n);
        for (block.values) |value| try int(a, &out, i32, value);
    }
    std.mem.writeInt(u32, out.items[16..20], @intCast(decoder.reader.offset), .little);
    std.mem.writeInt(u32, out.items[20..24], @intCast(decoder.restarts.count), .little);
    return out.toOwnedSlice(a);
}
