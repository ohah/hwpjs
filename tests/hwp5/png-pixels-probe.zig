const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const max_decoded = try r.readInt(u32);
    var decoded = try core.image.png_pixels.decode(a, bytes[r.offset..], .{ .structure = .{ .chunks = .{ .max_bytes = limit } }, .max_decoded_bytes = max_decoded });
    defer decoded.deinit(a);
    const report = decoded.report;
    const fields = [_]usize{ report.decoded_bytes, report.scanlines, report.passes, report.zlib_trailing_bytes, report.reconstructed_crc32, report.structure.ancillary_chunks_deferred, report.structure.ancillary_bytes_deferred, @intFromBool(report.structure.pixels_validated) };
    const out = try a.alloc(u8, 32 + decoded.bytes.len);
    for (fields, 0..) |value, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(value), .little);
    @memcpy(out[32..], decoded.bytes);
    return out;
}
