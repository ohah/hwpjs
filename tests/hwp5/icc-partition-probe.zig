const std = @import("std");
const icc = @import("hwpjs").image.icc;
const interval = @import("icc-interval-wire.zig").write;
fn coefficients(out: *[16]u8, values: [4]i32) void {
    for (values, 0..) |v, i| std.mem.writeInt(i32, out[i * 4 ..][0..4], v, .little);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const curve = try icc.parametric_curve.parse(bytes);
    const plan = try icc.parametric_segments.assemble(curve);
    const linear = if (plan.linear) |p| try icc.linear_clip.partition(p) else icc.linear_clip.Result{};
    const power = try icc.power_partition.partition(curve);
    const out = try a.alloc(u8, 8 + 64 * (linear.count + power.count));
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], @intCast(linear.count), .little);
    std.mem.writeInt(u32, out[4..8], @intCast(power.count), .little);
    for (linear.pieces[0..linear.count], 0..) |p, i| {
        const slot = out[8 + i * 64 ..][0..64];
        interval(slot[0..40], p.interval);
        std.mem.writeInt(u32, slot[40..44], @intFromEnum(p.kind), .little);
        std.mem.writeInt(u32, slot[44..48], @intFromEnum(p.direction), .little);
        coefficients(slot[48..64], .{ plan.linear.?.slope, plan.linear.?.offset, 0, 0 });
    }
    for (power.pieces[0..power.count], 0..) |p, i| {
        const slot = out[8 + (linear.count + i) * 64 ..][0..64];
        interval(slot[0..40], p.power.interval);
        std.mem.writeInt(u32, slot[40..44], 3, .little);
        std.mem.writeInt(u32, slot[44..48], @intFromEnum(p.direction), .little);
        coefficients(slot[48..64], .{ p.power.a, p.power.b, p.power.g, p.power.offset });
    }
    return out;
}
