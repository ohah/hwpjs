const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    const encoding = try r.readInt(u8);
    const method = try r.readInt(u8);
    if (method > 1) return error.InvalidInterpolationMethod;
    if (encoding > 2) return error.InvalidRgbEncoding;
    const interpolation: @import("hwpjs").image.jpeg_upsampling.Method = if (method == 0) .nearest else .bilinear;
    if (mode == 278) {
        if (encoding != 0) return error.InvalidRgbEncoding;
        var result = try core.image.jpeg_jfif_rgb.decode(a, bytes[r.offset..], .{ .upsampling = interpolation, .colour_management = .unmanaged, .max_rgb_bytes = maximum });
        defer result.deinit(a);
        return serialize(a, result.raster, &.{ result.jfif_version, @intCast(result.adobe_headers), result.icc_chunks, @intCast(result.application_markers), @intCast(result.unchecked_compressed_thumbnails), @intCast(result.unknown_extensions), @intFromBool(result.metadata_deferred) }, limit);
    }
    const width = try r.readInt(u32);
    const height = try r.readInt(u32);
    const precision = try r.readInt(u32);
    const count = try r.readInt(u32);
    if (width > 65535 or height > 65535 or precision > 255 or count > 3) return error.InvalidRasterWire;
    var pp: [3]core.image.jpeg_sample_planes.Plane = undefined;
    var initialized: usize = 0;
    defer for (pp[0..initialized]) |p| a.free(p.samples);
    for (pp[0..count]) |*p| {
        const id = try r.readInt(u32);
        const sampling = try r.readInt(u32);
        const quantization = try r.readInt(u32);
        const w = try r.readInt(u32);
        const h = try r.readInt(u32);
        if (id > 255 or sampling > 255 or quantization > 255) return error.InvalidRasterWire;
        const size = @as(u64, w) * h;
        if (size > (bytes.len - r.offset) / 2) return error.UnexpectedEnd;
        const samples = try a.alloc(u16, @intCast(size));
        p.* = .{ .component = .{ .id = @intCast(id), .sampling = @intCast(sampling), .quantization = @intCast(quantization) }, .extent = .{ .width = w, .height = h }, .samples = samples };
        initialized += 1;
        for (samples) |*sample| sample.* = try r.readInt(u16);
    }
    if (r.offset != bytes.len) return error.TrailingRasterWire;
    var result = try core.image.jpeg_rgb_raster.fromPlanes(a, .{ .width = @intCast(width), .height = @intCast(height), .precision = @intCast(precision), .planes = pp[0..count] }, .{ .encoding = @enumFromInt(encoding), .upsampling = interpolation, .max_rgb_bytes = maximum });
    defer result.deinit(a);
    return serialize(a, result, &.{}, limit);
}

fn serialize(a: std.mem.Allocator, result: core.image.jpeg_rgb_raster.Raster, extra: []const u32, limit: usize) ![]u8 {
    if (@as(u64, result.rgb.len) + 12 + extra.len * 4 > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ result.width, result.height, @intCast(result.rgb.len) }) |n| try int(a, &out, u32, n);
    for (extra) |n| try int(a, &out, u32, n);
    try out.appendSlice(a, result.rgb);
    return out.toOwnedSlice(a);
}
