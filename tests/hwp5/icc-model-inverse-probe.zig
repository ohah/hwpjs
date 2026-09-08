const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runFraction(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const prefix = if (bits == 128) 16 else 132;
    const header = 32 + 4 * width;
    const clipping_offset = 8 + 4 * width;
    const lengths_offset = clipping_offset + 12;
    const evaluate = if (bits == 128) icc.matrix_trc_inverse.evaluateFixed else icc.matrix_trc_inverse.evaluateFraction;
    const write = if (bits == 128) @import("icc-trc-inverse-output.zig").write else @import("icc-trc-inverse-output.zig").writeWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const Input = if (bits == 128) [3]i32 else icc.matrix_trc_inverse.FractionInput;
    var xyz: Input = undefined;
    if (bits == 128) {
        for (&xyz, 0..) |*v, i| v.* = std.mem.readInt(i32, bytes[4 + i * 4 ..][0..4], .big);
    } else {
        for (&xyz.numerators, 0..) |*v, i| v.* = std.mem.readInt(i256, bytes[4 + i * 32 ..][0..32], .big);
        xyz.denominator = std.mem.readInt(u256, bytes[100..132], .big);
    }
    var table = try icc.tag_table.parse(a, bytes[prefix..], .{ .max_bytes = limit, .policy = .icc_2022 });
    defer table.deinit(a);
    const model = try icc.matrix_trc_model.assemble(&table, .v4_2022);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try evaluate(128, model, xyz),
        256 => try evaluate(256, model, xyz),
        512 => try evaluate(512, model, xyz),
        1024 => try evaluate(1024, model, xyz),
        else => return error.InvalidIccComparisonPrecision,
    };
    var payloads: [3][]u8 = undefined;
    var count: usize = 0;
    defer for (payloads[0..count]) |p| a.free(p);
    var size: usize = header;
    for (result.device, 0..) |device, i| {
        payloads[i] = try write(a, device);
        count += 1;
        size += payloads[i].len;
    }
    const out = try a.alloc(u8, size);
    std.mem.writeInt(u32, out[0..4], @intFromBool(result.profile_semantics_deferred), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(result.transform_priority_deferred), .little);
    for (result.linear.numerators, 0..) |n, i| std.mem.writeInt(std.meta.Int(.signed, bits), out[8 + i * width ..][0..width], n, .little);
    std.mem.writeInt(std.meta.Int(.unsigned, bits), out[8 + 3 * width ..][0..width], result.linear.denominator, .little);
    for (result.clipping, 0..) |c, i| std.mem.writeInt(u32, out[clipping_offset + i * 4 ..][0..4], @intFromEnum(c), .little);
    var offset: usize = header;
    for (payloads, 0..) |p, i| {
        std.mem.writeInt(u32, out[lengths_offset + i * 4 ..][0..4], @intCast(p.len), .little);
        @memcpy(out[offset..][0..p.len], p);
        offset += p.len;
    }
    return out;
}
