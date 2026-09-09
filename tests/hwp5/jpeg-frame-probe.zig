const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const blocks = try r.readInt(u32);
    const scans = try r.readInt(u32);
    const restarts = try r.readInt(u32);
    const pixels = try r.readInt(u64);
    const trailing = try r.readInt(u8);
    if (limit < 36) return error.LimitExceeded;
    var decoder = try core.image.jpeg_sequential_frame.Decoder.init(bytes[r.offset..], .{ .max_blocks = blocks, .structure = .{ .markers = .{ .max_bytes = limit }, .frame = .{ .max_pixels = pixels }, .max_scans = scans, .max_restarts = restarts, .allow_trailing_bytes = trailing != 0 } });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendNTimes(a, 0, 36);
    while (try decoder.next()) |block| {
        if (limit - out.items.len < 272) return error.LimitExceeded;
        for ([_]u32{ block.component_id, @intCast(block.frame_component), block.x, block.y }) |n| try int(a, &out, u32, n);
        for (block.values) |value| try int(a, &out, i32, value);
    }
    const report = decoder.boundaries;
    const coverage = decoder.coverage.?;
    const words = [_]u32{ report.width, report.header_height, report.effective_height, @intCast(coverage.frame.components.count()), @intCast(coverage.scans), @intCast(decoder.blocks), @intCast(decoder.restarts), @intCast(decoder.markers.reader.offset), @intCast(report.trailing_bytes) };
    for (words, 0..) |n, i| std.mem.writeInt(u32, out.items[i * 4 ..][0..4], n, .little);
    return out.toOwnedSlice(a);
}
