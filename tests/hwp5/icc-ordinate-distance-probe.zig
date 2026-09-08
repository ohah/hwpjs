const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const prefix = 72 + bits / 4;
    const parse = if (bits == 128) @import("icc-ordinate-input.zig").parse else @import("icc-ordinate-input.zig").parseWide;
    const compare = if (bits == 128) icc.power_ordinate_distance.compare else icc.power_ordinate_distance.compareWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != prefix + 64) return error.InvalidProbeInput;
    const input = try parse(bytes[0..prefix]);
    const r = icc.power_ordinate_distance.Rational{ .numerator = std.mem.readInt(u256, bytes[prefix..][0..32], .big), .denominator = std.mem.readInt(u256, bytes[prefix + 32 ..][0..32], .big) };
    const result = switch (input.precision) {
        128 => try compare(128, input.value, r, input.target),
        256 => try compare(256, input.value, r, input.target),
        512 => try compare(512, input.value, r, input.target),
        1024 => try compare(1024, input.value, r, input.target),
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
