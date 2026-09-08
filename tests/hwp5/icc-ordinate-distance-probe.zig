const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 168) return error.InvalidProbeInput;
    const input = try @import("icc-ordinate-input.zig").parse(bytes[0..104]);
    const r = icc.power_ordinate_distance.Rational{ .numerator = std.mem.readInt(u256, bytes[104..136], .big), .denominator = std.mem.readInt(u256, bytes[136..168], .big) };
    const result = switch (input.precision) {
        128 => try icc.power_ordinate_distance.compare(128, input.value, r, input.target),
        256 => try icc.power_ordinate_distance.compare(256, input.value, r, input.target),
        512 => try icc.power_ordinate_distance.compare(512, input.value, r, input.target),
        1024 => try icc.power_ordinate_distance.compare(1024, input.value, r, input.target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (result) |v| switch (v) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}
