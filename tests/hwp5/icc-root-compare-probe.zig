const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn evaluate(comptime precision: u16, root: icc.power_level.Root, bytes: []const u8, affine: bool) !?std.math.Order {
    if (affine) return icc.power_root_compare.at(precision, root, std.mem.readInt(i32, bytes[20..24], .big), std.mem.readInt(i32, bytes[24..28], .big), .{
        .numerator = std.mem.readInt(u64, bytes[28..36], .big),
        .denominator = std.mem.readInt(u64, bytes[36..44], .big),
    });
    return icc.power_root_compare.compare(precision, root, std.mem.readInt(i128, bytes[20..36], .big), std.mem.readInt(u128, bytes[36..52], .big));
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, affine: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != @as(usize, if (affine) 44 else 52)) return error.InvalidProbeInput;
    const root = try @import("icc-root-input.zig").selected(bytes);
    const order = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try evaluate(128, root, bytes, affine),
        256 => try evaluate(256, root, bytes, affine),
        512 => try evaluate(512, root, bytes, affine),
        1024 => try evaluate(1024, root, bytes, affine),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (order) |value| switch (value) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}
