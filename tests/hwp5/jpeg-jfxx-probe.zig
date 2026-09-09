const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const parsed = try core.image.jpeg_jfxx.Extension.parse(bytes);
    var width: u32 = 0;
    var height: u32 = 0;
    var deferred: u32 = 0;
    switch (parsed) {
        .jpeg_unchecked => deferred = 1,
        .unknown => deferred = 2,
        .rgb => |v| {
            width = v.dimensions.width;
            height = v.dimensions.height;
            if (v.pixel(v.dimensions.pixels()) != null or v.pixel(std.math.maxInt(usize)) != null) return error.UnexpectedThumbnailPixel;
        },
        .indexed => |v| {
            width = v.dimensions.width;
            height = v.dimensions.height;
            if (v.pixel(v.indices.len) != null or v.pixel(std.math.maxInt(usize)) != null) return error.UnexpectedThumbnailPixel;
        },
    }
    const raw = bytes[6..];
    const pixels = width * height;
    if (24 + raw.len + @as(usize, pixels) * 3 > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ bytes[5], width, height, @intCast(raw.len), pixels * 3, deferred }) |n| try int(a, &out, u32, n);
    try out.appendSlice(a, raw);
    for (0..pixels) |i| {
        const rgb = switch (parsed) {
            .rgb => |v| v.pixel(i).?,
            .indexed => |v| v.pixel(i).?,
            else => unreachable,
        };
        try out.appendSlice(a, &rgb);
    }
    return out.toOwnedSlice(a);
}
