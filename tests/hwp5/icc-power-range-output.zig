const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn endpoint(out: *[84]u8, value: icc.power_range.types.Endpoint) void {
    @memset(out, 0);
    std.mem.writeInt(u64, out[0..8], value.at.numerator, .little);
    std.mem.writeInt(u64, out[8..16], value.at.denominator, .little);
    switch (value.value) {
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
pub fn write(a: std.mem.Allocator, result: icc.power_range.Result) ![]u8 {
    const out = try a.alloc(u8, if (result == .range) 172 else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .undecided => 1,
        .range => 2,
    }, .little);
    if (result == .range) {
        endpoint(out[4..88], result.range.lower);
        endpoint(out[88..172], result.range.upper);
    }
    return out;
}
