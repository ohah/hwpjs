const std = @import("std");
const core = @import("hwpjs");
const wire = @import("jpeg-sample-image-wire.zig");

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runMode(a, bytes, limit, false);
}

pub fn runJfxx(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runMode(a, bytes, limit, true);
}

fn runMode(a: std.mem.Allocator, bytes: []const u8, limit: usize, jfxx: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    if (limit < 16) return error.LimitExceeded;
    const options: core.image.jpeg_sample_planes.Options = .{ .max_samples = maximum, .frame = .{ .structure = .{ .markers = .{ .max_bytes = limit } } } };
    var decoded = if (jfxx) try core.image.jpeg_jfxx_jpeg.decode(a, bytes[r.offset..], options) else try core.image.jpeg_sample_planes.decode(a, bytes[r.offset..], options);
    defer decoded.deinit(a);
    if (wire.required(decoded) > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try wire.append(a, &out, decoded);
    return out.toOwnedSlice(a);
}
