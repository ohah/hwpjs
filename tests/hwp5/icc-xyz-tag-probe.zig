const std = @import("std");
const icc = @import("hwpjs").image.icc;
/// Test wire: class signature, tag signature, then the unpadded tag payload.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 8) return error.InvalidProbeInput;
    // Obtain the class using the public header inspector, not a duplicate table.
    var header_bytes = [_]u8{0} ** 128;
    header_bytes[8] = 4;
    header_bytes[12..16].* = bytes[0..4].*;
    header_bytes[16..20].* = "RGB ".*;
    header_bytes[20..24].* = "XYZ ".*;
    header_bytes[36..40].* = "acsp".*;
    const identifiers = try icc.header_identifiers.inspect(try icc.header.parse(&header_bytes), .v4_2022);
    const value = try icc.xyz_tag.parse(bytes[4..8].*, bytes[8..]);
    const out = try a.alloc(u8, 24);
    errdefer a.free(out);
    @memset(out, 0);
    if (value) |v| {
        const report = try icc.xyz_tag_values.inspectV4(identifiers.profile_class, v);
        const fields = [_]u32{ 1, @intFromEnum(v.kind), @intFromBool(report.context_deferred), @intFromBool(report.luminance_unused_nonzero) };
        // Status, kind, and signed XYZ components; report flags share one word.
        std.mem.writeInt(u32, out[0..4], fields[0], .little);
        std.mem.writeInt(u32, out[4..8], fields[1], .little);
        for (v.xyz, 0..) |n, i| std.mem.writeInt(i32, out[8 + i * 4 ..][0..4], n, .little);
        std.mem.writeInt(u32, out[20..24], fields[2] | (fields[3] << 1), .little);
    }
    return out;
}
