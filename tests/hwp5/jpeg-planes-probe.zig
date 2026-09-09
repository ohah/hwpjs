const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

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
    var required: u64 = 16;
    for (decoded.planes) |plane| required += 20 + @as(u64, plane.samples.len) * 2;
    if (required > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ decoded.width, decoded.height, decoded.precision, @intCast(decoded.planes.len) }) |value| try int(a, &out, u32, value);
    for (decoded.planes) |plane| {
        for ([_]u32{ plane.component.id, plane.component.sampling, plane.component.quantization, plane.extent.width, plane.extent.height }) |value| try int(a, &out, u32, value);
        for (plane.samples) |sample| try int(a, &out, u16, sample);
    }
    return out.toOwnedSlice(a);
}
