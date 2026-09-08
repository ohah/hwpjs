const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const prefix = 4 + 2 * width;
    const U = std.meta.Int(.unsigned, bits);
    const split = if (bits == 128) 96 else 288;
    const select = if (bits == 128) icc.parametric_inverse.select else icc.parametric_inverse.selectWide;
    const write = if (bits == 128) @import("icc-parametric-nearest-output.zig").write else @import("icc-parametric-nearest-output.zig").writeWide;
    const endpoint = if (bits == 128) @import("icc-preimage-endpoint-wire.zig").write else @import("icc-preimage-endpoint-wire.zig").writeWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[prefix..]);
    const target = icc.fraction.Normalized(bits){ .numerator = std.mem.readInt(U, bytes[4..][0..width], .big), .denominator = std.mem.readInt(U, bytes[4 + width ..][0..width], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try select(128, curve, target),
        256 => try select(256, curve, target),
        512 => try select(512, curve, target),
        1024 => try select(1024, curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    if (result != .selected) return write(a, switch (result) {
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .tie = tie },
        .selected => unreachable,
    });
    const ordinate = try write(a, .{ .selected = result.selected.ordinate });
    defer a.free(ordinate);
    const out = try a.alloc(u8, split + ordinate.len);
    std.mem.writeInt(u32, out[0..4], 5, .little);
    endpoint(out[4..split], .{ .coordinate = result.selected.coordinate, .attained = true });
    @memcpy(out[split..], ordinate);
    return out;
}
