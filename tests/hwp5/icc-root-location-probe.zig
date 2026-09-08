const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn locate(comptime precision: u16, bytes: []const u8) !icc.affine_root_location.Location {
    const flags = std.mem.readInt(u32, bytes[28..32], .big);
    if (flags > 3) return error.InvalidProbeInput;
    return icc.affine_root_location.locate(precision, try @import("icc-root-input.zig").selected(bytes), std.mem.readInt(i32, bytes[20..24], .big), std.mem.readInt(i32, bytes[24..28], .big), .{
        .start = .{ .numerator = std.mem.readInt(u64, bytes[32..40], .big), .denominator = std.mem.readInt(u64, bytes[40..48], .big) },
        .end = .{ .numerator = std.mem.readInt(u64, bytes[48..56], .big), .denominator = std.mem.readInt(u64, bytes[56..64], .big) },
        .start_included = flags & 1 != 0,
        .end_included = flags & 2 != 0,
    });
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 64) return error.InvalidProbeInput;
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try locate(128, bytes),
        256 => try locate(256, bytes),
        512 => try locate(512, bytes),
        1024 => try locate(1024, bytes),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(result), .little);
    return out;
}
