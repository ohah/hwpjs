const std = @import("std");
const icc = @import("hwpjs").image.icc;
const output = @import("icc-power-range-output.zig");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, point: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const prefix: usize = if (point) 20 else 4;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[prefix..]);
    const precision = std.mem.readInt(u32, bytes[0..4], .big);
    if (point) {
        const source = (try icc.parametric_segments.assemble(curve)).power orelse return error.NoActiveIccPowerBranch;
        const x: @TypeOf(source.interval.start) = .{ .numerator = std.mem.readInt(u64, bytes[4..12], .big), .denominator = std.mem.readInt(u64, bytes[12..20], .big) };
        const value = switch (precision) {
            128 => try icc.power_ordinate.at(128, source, x),
            256 => try icc.power_ordinate.at(256, source, x),
            512 => try icc.power_ordinate.at(512, source, x),
            1024 => try icc.power_ordinate.at(1024, source, x),
            else => return error.InvalidIccComparisonPrecision,
        };
        const out = try a.alloc(u8, if (value != null) 88 else 4);
        std.mem.writeInt(u32, out[0..4], @intFromBool(value != null), .little);
        if (value) |v| output.endpoint(out[4..88], .{ .at = x, .value = v });
        return out;
    }
    const result = switch (precision) {
        128 => try icc.power_range.build(128, curve),
        256 => try icc.power_range.build(256, curve),
        512 => try icc.power_range.build(512, curve),
        1024 => try icc.power_range.build(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    return output.write(a, result);
}
