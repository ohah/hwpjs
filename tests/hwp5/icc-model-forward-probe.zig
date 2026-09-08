const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 48) return error.InvalidProbeInput;
    var input: [3]icc.trc_forward.Fraction = undefined;
    for (&input, 0..) |*x, i| x.* = .{ .numerator = std.mem.readInt(u64, bytes[i * 16 ..][0..8], .big), .denominator = std.mem.readInt(u64, bytes[i * 16 + 8 ..][0..8], .big) };
    var table = try icc.tag_table.parse(a, bytes[48..], .{ .max_bytes = limit, .policy = .icc_2022 });
    defer table.deinit(a);
    const model = try icc.matrix_trc_model.assemble(&table, .v4_2022);
    const result = try icc.matrix_trc_forward.evaluate(model, input);
    const out = try a.alloc(u8, 140);
    @memset(out, 0);
    std.mem.writeInt(u32, out[4..8], @intFromBool(result.profile_semantics_deferred), .little);
    std.mem.writeInt(u32, out[8..12], @intFromBool(result.transform_priority_deferred), .little);
    switch (result.xyz) {
        .exact => |v| {
            for (v.numerators, 0..) |n, i| std.mem.writeInt(i256, out[12 + i * 32 ..][0..32], n, .little);
            std.mem.writeInt(u256, out[108..140], v.denominator, .little);
        },
        .approximate => |v| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            for (v, 0..) |x, i| std.mem.writeInt(u64, out[12 + i * 8 ..][0..8], @bitCast(x), .little);
        },
    }
    return out;
}
