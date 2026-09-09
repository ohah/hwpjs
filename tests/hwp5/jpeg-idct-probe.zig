const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, transform: bool) ![]u8 {
    if (bytes.len > limit or limit < (if (transform) @as(usize, 640) else 128)) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    const format = try core.image.jpeg_sample_restoration.Format.init(try r.readInt(u8));
    var centered: [64]f64 = undefined;
    if (transform) {
        var coefficients: [64]i64 = undefined;
        for (&coefficients) |*value| value.* = try r.readInt(i64);
        centered = core.image.jpeg_idct.transform(coefficients);
    } else {
        for (&centered) |*value| value.* = @bitCast(try r.readInt(u64));
    }
    if (r.offset != bytes.len) return error.TrailingJpegTransformBytes;
    const samples = try format.block(centered);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (transform) for (centered) |value| try int(a, &out, u64, @bitCast(value));
    for (samples) |value| try int(a, &out, u16, value);
    return out.toOwnedSlice(a);
}
