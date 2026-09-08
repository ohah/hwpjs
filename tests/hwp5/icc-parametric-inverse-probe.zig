const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const target = icc.parametric_inverse.Target{ .numerator = std.mem.readInt(u128, bytes[4..20], .big), .denominator = std.mem.readInt(u128, bytes[20..36], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_inverse.select(128, curve, target),
        256 => try icc.parametric_inverse.select(256, curve, target),
        512 => try icc.parametric_inverse.select(512, curve, target),
        1024 => try icc.parametric_inverse.select(1024, curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const output = @import("icc-parametric-nearest-output.zig");
    if (result != .selected) return output.write(a, switch (result) {
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .tie = tie },
        .selected => unreachable,
    });
    const ordinate = try output.write(a, .{ .selected = result.selected.ordinate });
    defer a.free(ordinate);
    const out = try a.alloc(u8, 96 + ordinate.len);
    std.mem.writeInt(u32, out[0..4], 5, .little);
    @import("icc-preimage-endpoint-wire.zig").write(out[4..96], .{ .coordinate = result.selected.coordinate, .attained = true });
    @memcpy(out[96..], ordinate);
    return out;
}
