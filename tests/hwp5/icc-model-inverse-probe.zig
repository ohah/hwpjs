const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 16) return error.InvalidProbeInput;
    var xyz: [3]i32 = undefined;
    for (&xyz, 0..) |*v, i| v.* = std.mem.readInt(i32, bytes[4 + i * 4 ..][0..4], .big);
    var table = try icc.tag_table.parse(a, bytes[16..], .{ .max_bytes = limit, .policy = .icc_2022 });
    defer table.deinit(a);
    const model = try icc.matrix_trc_model.assemble(&table, .v4_2022);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.matrix_trc_inverse.evaluateFixed(128, model, xyz),
        256 => try icc.matrix_trc_inverse.evaluateFixed(256, model, xyz),
        512 => try icc.matrix_trc_inverse.evaluateFixed(512, model, xyz),
        1024 => try icc.matrix_trc_inverse.evaluateFixed(1024, model, xyz),
        else => return error.InvalidIccComparisonPrecision,
    };
    var payloads: [3][]u8 = undefined;
    var count: usize = 0;
    defer for (payloads[0..count]) |p| a.free(p);
    var size: usize = 96;
    for (result.device, 0..) |device, i| {
        payloads[i] = try @import("icc-trc-inverse-output.zig").write(a, device);
        count += 1;
        size += payloads[i].len;
    }
    const out = try a.alloc(u8, size);
    std.mem.writeInt(u32, out[0..4], @intFromBool(result.profile_semantics_deferred), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(result.transform_priority_deferred), .little);
    for (result.linear.numerators, 0..) |n, i| std.mem.writeInt(i128, out[8 + i * 16 ..][0..16], n, .little);
    std.mem.writeInt(u128, out[56..72], result.linear.denominator, .little);
    for (result.clipping, 0..) |c, i| std.mem.writeInt(u32, out[72 + i * 4 ..][0..4], @intFromEnum(c), .little);
    var offset: usize = 96;
    for (payloads, 0..) |p, i| {
        std.mem.writeInt(u32, out[84 + i * 4 ..][0..4], @intCast(p.len), .little);
        @memcpy(out[offset..][0..p.len], p);
        offset += p.len;
    }
    return out;
}
