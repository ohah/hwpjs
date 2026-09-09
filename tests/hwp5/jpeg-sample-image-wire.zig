const std = @import("std");
const Image = @import("hwpjs").image.jpeg_sample_planes.Image;
const int = @import("resource-probe.zig").int;

pub fn required(image: Image) u64 {
    var size: u64 = 16;
    for (image.planes) |plane| size += 20 + @as(u64, plane.samples.len) * 2;
    return size;
}

pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), image: Image) !void {
    for ([_]u32{ image.width, image.height, image.precision, @intCast(image.planes.len) }) |v| try int(a, out, u32, v);
    for (image.planes) |plane| {
        for ([_]u32{ plane.component.id, plane.component.sampling, plane.component.quantization, plane.extent.width, plane.extent.height }) |v| try int(a, out, u32, v);
        for (plane.samples) |sample| try int(a, out, u16, sample);
    }
}
