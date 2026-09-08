const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const target = icc.power_range_nearest.Target{ .numerator = std.mem.readInt(u128, bytes[4..20], .big), .denominator = std.mem.readInt(u128, bytes[20..36], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.power_range_nearest.select(128, curve, target),
        256 => try icc.power_range_nearest.select(256, curve, target),
        512 => try icc.power_range_nearest.select(512, curve, target),
        1024 => try icc.power_range_nearest.select(1024, curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, switch (result) {
        .inactive, .undecided => 4,
        .target => 36,
        .endpoint => 88,
    });
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .undecided => 1,
        .target => 2,
        .endpoint => 3,
    }, .little);
    switch (result) {
        .inactive, .undecided => {},
        .target => |t| {
            std.mem.writeInt(u128, out[4..20], t.numerator, .little);
            std.mem.writeInt(u128, out[20..36], t.denominator, .little);
        },
        .endpoint => |e| @import("icc-power-range-output.zig").endpoint(out[4..88], e),
    }
    return out;
}
