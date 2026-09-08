const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn boundary(out: *[32]u8, value: icc.power_clip.types.Boundary) void {
    switch (value) {
        .rational => |x| {
            std.mem.writeInt(u64, out[4..12], x.numerator, .little);
            std.mem.writeInt(u64, out[12..20], x.denominator, .little);
        },
        .level_root => |r| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            std.mem.writeInt(u32, out[4..8], @intFromEnum(r.level), .little);
            @import("icc-power-root-wire.zig").write(out[8..28], r.value);
        },
    }
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[4..]);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.power_clip.partition(128, curve),
        256 => try icc.power_clip.partition(256, curve),
        512 => try icc.power_clip.partition(512, curve),
        1024 => try icc.power_clip.partition(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    const count = if (result == .plan) result.plan.count else 0;
    const out = try a.alloc(u8, if (result == .plan) 64 + count * 76 else 8);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .undecided => 1,
        .plan => 2,
    }, .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .plan) {
        const plan = result.plan;
        @import("icc-interval-wire.zig").write(out[8..48], plan.source.interval);
        for ([_]i32{ plan.source.a, plan.source.b, plan.source.g, plan.source.offset }, 0..) |v, i| std.mem.writeInt(i32, out[48 + 4 * i ..][0..4], v, .little);
        for (plan.pieces[0..count], 0..) |piece, i| {
            const slot = out[64 + 76 * i ..][0..76];
            boundary(slot[0..32], piece.interval.start);
            boundary(slot[32..64], piece.interval.end);
            std.mem.writeInt(u32, slot[64..68], @as(u32, @intFromBool(piece.interval.start_included)) | (@as(u32, @intFromBool(piece.interval.end_included)) << 1), .little);
            std.mem.writeInt(u32, slot[68..72], @intFromEnum(piece.kind), .little);
            std.mem.writeInt(u32, slot[72..76], @intFromEnum(piece.direction), .little);
        }
    }
    return out;
}
