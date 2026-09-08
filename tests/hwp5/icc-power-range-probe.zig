const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn write(out: *[84]u8, endpoint: icc.power_range.types.Endpoint) void {
    @memset(out, 0);
    std.mem.writeInt(u64, out[0..8], endpoint.at.numerator, .little);
    std.mem.writeInt(u64, out[8..16], endpoint.at.denominator, .little);
    switch (endpoint.value) {
        .rational => |r| {
            std.mem.writeInt(u256, out[20..52], r.numerator, .little);
            std.mem.writeInt(u256, out[52..84], r.denominator, .little);
        },
        .power => |p| {
            std.mem.writeInt(u32, out[16..20], 1, .little);
            std.mem.writeInt(i128, out[20..36], p.base.numerator, .little);
            std.mem.writeInt(u128, out[36..52], p.base.denominator, .little);
            std.mem.writeInt(i32, out[52..56], p.g, .little);
            std.mem.writeInt(i32, out[56..60], p.offset, .little);
        },
    }
}
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
        if (value) |v| write(out[4..88], .{ .at = x, .value = v });
        return out;
    }
    const result = switch (precision) {
        128 => try icc.power_range.build(128, curve),
        256 => try icc.power_range.build(256, curve),
        512 => try icc.power_range.build(512, curve),
        1024 => try icc.power_range.build(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, if (result == .range) 172 else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .undecided => 1,
        .range => 2,
    }, .little);
    if (result == .range) {
        write(out[4..88], result.range.lower);
        write(out[88..172], result.range.upper);
    }
    return out;
}
