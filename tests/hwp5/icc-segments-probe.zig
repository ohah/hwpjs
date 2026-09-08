const std = @import("std");
const icc = @import("hwpjs").image.icc;
const interval = @import("icc-interval-wire.zig").write;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const plan = try icc.parametric_segments.assemble(try icc.parametric_curve.parse(bytes));
    const out = try a.alloc(u8, 112);
    @memset(out, 0);
    if (plan.linear) |p| {
        interval(out[0..40], p.interval);
        std.mem.writeInt(i32, out[40..44], p.slope, .little);
        std.mem.writeInt(i32, out[44..48], p.offset, .little);
    }
    if (plan.power) |p| {
        interval(out[56..96], p.interval);
        for ([_]i32{ p.a, p.b, p.g, p.offset }, 0..) |v, i| std.mem.writeInt(i32, out[96 + i * 4 ..][0..4], v, .little);
    }
    return out;
}
