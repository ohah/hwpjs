const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const report = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    var fields: [12]u32 = @splat(0);
    var alpha: [256]u8 = @splat(255);
    if (report.transparency) |value| {
        fields[0] = 1;
        switch (value) {
            .grayscale => |sample| {
                fields[1] = 1;
                fields[3] = @intFromBool(sample.raw != sample.value);
                fields[4] = sample.raw;
                fields[7] = sample.value;
            },
            .truecolor => |samples| {
                fields[1] = 2;
                for (samples, 0..) |sample, i| {
                    fields[3] += @intFromBool(sample.raw != sample.value);
                    fields[4 + i] = sample.raw;
                    fields[7 + i] = sample.value;
                }
            },
            .indexed => |palette| {
                fields[1] = 3;
                fields[2] = palette.count;
                alpha = palette.alpha;
            },
        }
    }
    fields[10] = @intCast(report.structure.ancillary_chunks_deferred);
    fields[11] = @intCast(report.structure.ancillary_bytes_deferred);
    const out = try a.alloc(u8, 304);
    for (fields, 0..) |value, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], value, .little);
    @memcpy(out[48..], &alpha);
    return out;
}
