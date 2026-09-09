const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn axis(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len % 8 != 0) return error.InvalidAxisBatch;
    if (@as(u64, bytes.len / 8) * 20 > limit) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    while (r.offset < bytes.len) {
        const reference = try r.readInt(u16);
        const source = try r.readInt(u16);
        const coordinate = try r.readInt(u32);
        const mapping = try core.image.jpeg_sample_axis.Axis.fromDimensions(reference, source);
        const w = mapping.at(coordinate) orelse return error.InvalidSampleCoordinate;
        for ([_]u32{ w.lower, w.upper, w.upper_weight, w.denominator, w.nearest() }) |n| try int(a, &out, u32, n);
    }
    return out.toOwnedSlice(a);
}

pub fn plane(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const width = try r.readInt(u16);
    const height = try r.readInt(u16);
    const reference_width = try r.readInt(u16);
    const reference_height = try r.readInt(u16);
    const method = try r.readInt(u8);
    if (method > 1) return error.InvalidInterpolationMethod;
    const count = @as(u32, width) * height;
    if (@as(u64, count) * 2 != bytes.len - r.offset) return error.InvalidJpegSamplePlaneLength;
    if (@as(u64, reference_width) * reference_height * 2 > limit) return error.LimitExceeded;
    const samples = try a.alloc(u16, count);
    defer a.free(samples);
    for (samples) |*value| value.* = try r.readInt(u16);
    const sampler = try core.image.jpeg_upsampling.Sampler.fromDimensions(samples, width, height, reference_width, reference_height, if (method == 0) .nearest else .bilinear);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (0..reference_height) |y| for (0..reference_width) |x| try int(a, &out, u16, sampler.sample(@intCast(x), @intCast(y)).?);
    return out.toOwnedSlice(a);
}
