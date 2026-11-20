//! MS-OLEDS 2.3.1/2.3.4: explicit registered PNG presentation, not copied raw.
//! Format/transport experiment; external HWP application support is unproved.
const std = @import("std");
pub const stream_name = "\x02OlePres000";
pub fn write(a: std.mem.Allocator, png: []const u8, width: u32, height: u32, limit: usize) ![]u8 {
    if (png.len > 8 * 1024 * 1024 or png.len > limit or limit - png.len < 40) return error.LimitExceeded;
    const report = try @import("../../image/png/structure.zig").inspect(png, .{ .max_pixels = 4 * 1024 * 1024 });
    if (report.header.width != width or report.header.height != height) return error.InvalidChartCreatePreviewPNG;
    const out = try a.alloc(u8, 40 + png.len);
    @memset(out[0..40], 0);
    put(out, 0, 4); // ANSI characters, including the terminating null.
    @memcpy(out[4..8], "PNG\x00");
    put(out, 8, 4); // No DVTARGETDEVICE.
    put(out, 12, 1); // DVASPECT_CONTENT.
    put(out, 16, 0xffffffff); // lindex -1.
    put(out, 20, 2); // ADVF_PRIMEFIRST.
    put(out, 28, width);
    put(out, 32, height);
    put(out, 36, @intCast(png.len));
    @memcpy(out[40..], png);
    return out;
}
pub fn verify(bytes: []const u8, png: []const u8, width: u32, height: u32) !void {
    if (bytes.len < 40 or bytes.len - 40 != png.len) return error.ChartCreateVerificationFailed;
    if (get(bytes, 0) != 4 or !std.mem.eql(u8, bytes[4..8], "PNG\x00") or get(bytes, 8) != 4 or get(bytes, 12) != 1 or get(bytes, 16) != 0xffffffff or get(bytes, 20) != 2 or get(bytes, 24) != 0 or get(bytes, 28) != width or get(bytes, 32) != height or get(bytes, 36) != png.len or !std.mem.eql(u8, bytes[40..], png)) return error.ChartCreateVerificationFailed;
}
fn put(b: []u8, o: usize, v: u32) void {
    std.mem.writeInt(u32, b[o..][0..4], v, .little);
}
fn get(b: []const u8, o: usize) u32 {
    return std.mem.readInt(u32, b[o..][0..4], .little);
}
