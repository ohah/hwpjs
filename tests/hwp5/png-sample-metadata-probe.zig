const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const report = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    var fields: [12]u32 = @splat(0);
    if (report.physical) |p| {
        fields[0] = 1;
        fields[1] = p.x;
        fields[2] = p.y;
        fields[3] = p.unit;
    }
    if (report.significant_bits) |s| {
        fields[4] = 1;
        fields[5] = s.count;
        for (s.bits, 0..) |v, i| fields[6 + i] = v;
    }
    fields[10] = @intCast(report.structure.ancillary_chunks_deferred);
    fields[11] = @intCast(report.structure.ancillary_bytes_deferred);
    const out = try a.alloc(u8, 48);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}
