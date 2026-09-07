const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const report = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    var fields: [13]u32 = @splat(0);
    if (report.background) |bg| switch (bg) {
        .grayscale => |v| {
            fields[0] = 1;
            fields[2] = v.raw;
            fields[5] = v.value;
        },
        .truecolor => |rgb| {
            fields[0] = 2;
            for (rgb, 0..) |v, i| {
                fields[2 + i] = v.raw;
                fields[5 + i] = v.value;
            }
        },
        .indexed => |index| {
            fields[0] = 3;
            fields[1] = index;
        },
    };
    fields[8] = @intFromBool(report.histogram != null);
    fields[9] = if (report.histogram) |hist| hist.count else 0;
    fields[10] = @intFromBool(report.histogram_usage_validated);
    fields[11] = @intCast(report.structure.ancillary_chunks_deferred);
    fields[12] = @intCast(report.structure.ancillary_bytes_deferred);
    const out = try a.alloc(u8, 564);
    @memset(out, 0);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    if (report.histogram) |hist| for (hist.frequencies, 0..) |v, i| std.mem.writeInt(u16, out[52 + i * 2 ..][0..2], v, .little);
    return out;
}
