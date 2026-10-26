const std = @import("std");
const structure = @import("structure.zig");
pub const Options = struct { structure: structure.Options = .{}, max_pixels: usize = 16_000_000 };
pub const Image = struct {
    width: usize,
    height: usize,
    rgba: []u8,
    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        a.free(self.rgba);
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const report = try structure.inspect(bytes, options.structure);
    const rgb = report.bits_per_plane == 8 and report.planes == 3 and report.version == 5;
    const indexed8 = report.bits_per_plane == 8 and report.planes == 1 and report.has_vga_palette;
    const indexed16 = (report.bits_per_plane == 1 or report.bits_per_plane == 4 and report.planes == 1) and (report.version == 2 or report.version == 4 or report.version == 5);
    if (!rgb and !indexed8 and !indexed16) return error.UnsupportedPcxPixelProfile;
    const count = std.math.mul(usize, report.width, report.height) catch return error.LimitExceeded;
    if (count > options.max_pixels) return error.LimitExceeded;
    const rgba = try a.alloc(u8, std.math.mul(usize, count, 4) catch return error.LimitExceeded);
    errdefer a.free(rgba);
    const stride = report.bytes_per_line * @as(usize, report.planes);
    const row = try a.alloc(u8, stride);
    defer a.free(row);
    var runs: @import("rle.zig").Iterator = .{ .bytes = bytes[128..][0..report.encoded_bytes], .decoded_bytes = report.decoded_bytes, .scanline_bytes = stride };
    while (try runs.next()) |run| {
        const start = run.offset % stride;
        @memset(row[start..][0..run.count], run.value);
        if ((run.offset + run.count) % stride != 0) continue;
        const y = (run.offset + run.count) / stride - 1;
        for (0..report.width) |x| {
            const out = rgba[(y * report.width + x) * 4 ..][0..4];
            if (rgb) {
                for (0..3) |channel| out[channel] = row[channel * report.bytes_per_line + x];
            } else {
                var index: usize = 0;
                if (indexed8) index = row[x] else if (report.bits_per_plane == 4) {
                    index = (row[x / 2] >> @as(u3, @intCast(if (x % 2 == 0) @as(u8, 4) else 0))) & 15;
                } else for (0..report.planes) |plane| {
                    const bit = (row[plane * report.bytes_per_line + x / 8] >> @as(u3, @intCast(7 - x % 8))) & 1;
                    index |= @as(usize, bit) << @as(std.math.Log2Int(usize), @intCast(plane));
                }
                const palette = if (indexed8) bytes[bytes.len - 768 ..] else bytes[16..64];
                @memcpy(out[0..3], palette[index * 3 ..][0..3]);
            }
            out[3] = 255;
        }
    }
    return .{ .width = report.width, .height = report.height, .rgba = rgba };
}
