const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

fn field(r: *core.Reader) ![]const u8 {
    return r.take(try r.readInt(u16));
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
    const q = try field(&r);
    const h = try field(&r);
    if (q.len != 0) try store.installQuantization(q, .{});
    if (h.len != 0) try store.installHuffman(h, .{});
    const scan = try field(&r);
    const count = try r.readInt(u32);
    if (@as(u64, count) * 272 + 24 > limit) return error.LimitExceeded;
    var prior: core.Reader = .{ .bytes = try r.take(@as(usize, count) * 256) };
    var decoder = try core.image.jpeg_progressive_scan.Decoder.init(frame, scan, &store, height, interval, bytes[r.offset..], .{ .max_bytes = limit, .max_blocks = maximum, .max_restarts = restarts });
    if (decoder.layout.blocks != count) return error.InvalidJpegPriorBlockCount;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ decoder.layout.columns, decoder.layout.rows, @intCast(decoder.layout.count), count, 0, 0 }) |n| try int(a, &out, u32, n);
    for (0..count) |_| {
        var values: [64]i32 = undefined;
        for (&values) |*v| v.* = try prior.readInt(i32);
        const expected_position = decoder.position().?;
        const block = (try decoder.next(values)).?;
        if (block.frame_component != expected_position.frame_component or block.x != expected_position.x or block.y != expected_position.y) return error.InvalidJpegBlockPosition;
        for ([_]u32{ block.component_id, @intCast(block.frame_component), block.x, block.y }) |n| try int(a, &out, u32, n);
        for (block.values) |value| try int(a, &out, i32, value);
    }
    if (try decoder.next(@splat(0)) != null or !decoder.complete) return error.UnfinishedJpegScan;
    std.mem.writeInt(u32, out.items[16..20], @intCast(decoder.reader.offset), .little);
    std.mem.writeInt(u32, out.items[20..24], @intCast(decoder.restarts.count), .little);
    return out.toOwnedSlice(a);
}
