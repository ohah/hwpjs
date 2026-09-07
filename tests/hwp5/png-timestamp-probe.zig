const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const report = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    var fields: [9]u32 = @splat(0);
    if (report.timestamp) |v| fields[0..7].* = .{ 1, v.year, v.month, v.day, v.hour, v.minute, v.second };
    fields[7] = @intCast(report.structure.ancillary_chunks_deferred);
    fields[8] = @intCast(report.structure.ancillary_bytes_deferred);
    const out = try a.alloc(u8, 36);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}
