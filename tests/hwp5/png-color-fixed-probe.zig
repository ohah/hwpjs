const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const r = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    var fields: [14]u32 = @splat(0);
    if (r.gamma) |v| {
        fields[0] = 1;
        fields[1] = v.scaled;
    }
    if (r.chromaticities) |v| {
        fields[2] = 1;
        for ([_]@TypeOf(v.white){ v.white, v.red, v.green, v.blue }, 0..) |p, i| {
            fields[3 + i * 2] = p.x;
            fields[4 + i * 2] = p.y;
        }
    }
    fields[11] = @intFromBool(r.color_semantics_deferred);
    fields[12] = @intCast(r.structure.ancillary_chunks_deferred);
    fields[13] = @intCast(r.structure.ancillary_bytes_deferred);
    const out = try a.alloc(u8, 56);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}
