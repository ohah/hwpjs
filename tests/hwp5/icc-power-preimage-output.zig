const std = @import("std");
const Result = @import("hwpjs").image.icc.power_preimage.Result;
pub fn write(a: std.mem.Allocator, result: Result) ![]u8 {
    return writeFor(80, a, result);
}
pub fn writeWide(a: std.mem.Allocator, result: @import("hwpjs").image.icc.power_preimage.Wide.Result) ![]u8 {
    return writeFor(272, a, result);
}
fn writeFor(comptime stride: usize, a: std.mem.Allocator, result: anytype) ![]u8 {
    const size = if (result == .set) 68 + result.set.interval_count * 68 + result.set.point_count * stride else 12;
    const out = try a.alloc(u8, size);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .undecided => 1,
        .set => 2,
    }, .little);
    if (result == .set) {
        const set = result.set;
        std.mem.writeInt(u32, out[4..8], @intCast(set.interval_count), .little);
        std.mem.writeInt(u32, out[8..12], @intCast(set.point_count), .little);
        @import("icc-interval-wire.zig").write(out[12..52], set.source.interval);
        for ([_]i32{ set.source.a, set.source.b, set.source.g, set.source.offset }, 0..) |v, i| std.mem.writeInt(i32, out[52 + i * 4 ..][0..4], v, .little);
        for (set.intervals[0..set.interval_count], 0..) |interval, i| {
            const slot = out[68 + i * 68 ..][0..68];
            @import("icc-power-boundary-wire.zig").write(slot[0..32], interval.start);
            @import("icc-power-boundary-wire.zig").write(slot[32..64], interval.end);
            std.mem.writeInt(u32, slot[64..68], @as(u32, @intFromBool(interval.start_included)) | (@as(u32, @intFromBool(interval.end_included)) << 1), .little);
        }
        for (set.points[0..set.point_count], 0..) |point, i| {
            const slot = out[68 + set.interval_count * 68 + i * stride ..][0..stride];
            std.mem.writeInt(u32, slot[0..4], @intFromEnum(point.location), .little);
            if (stride == 80) @import("icc-normalized-root-wire.zig").write(slot[4..80], point.root) else @import("icc-normalized-root-wire.zig").writeWide(slot[4..272], point.root);
        }
    }
    return out;
}
