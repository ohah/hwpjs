const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn interval(out: []u8, value: icc.parametric_segments.Interval) void {
    std.mem.writeInt(u32, out[0..4], 1, .little);
    std.mem.writeInt(u64, out[4..12], value.start.numerator, .little);
    std.mem.writeInt(u64, out[12..20], value.start.denominator, .little);
    std.mem.writeInt(u64, out[20..28], value.end.numerator, .little);
    std.mem.writeInt(u64, out[28..36], value.end.denominator, .little);
    std.mem.writeInt(u32, out[36..40], @as(u32, @intFromBool(value.start_included)) | (@as(u32, @intFromBool(value.end_included)) << 1), .little);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const plan = try icc.parametric_segments.assemble(try icc.parametric_curve.parse(bytes));
    const out = try a.alloc(u8, 112);
    @memset(out, 0);
    if (plan.linear) |p| {
        interval(out[0..56], p.interval);
        std.mem.writeInt(i32, out[40..44], p.slope, .little);
        std.mem.writeInt(i32, out[44..48], p.offset, .little);
    }
    if (plan.power) |p| {
        interval(out[56..112], p.interval);
        for ([_]i32{ p.a, p.b, p.g, p.offset }, 0..) |v, i| std.mem.writeInt(i32, out[96 + i * 4 ..][0..4], v, .little);
    }
    return out;
}
