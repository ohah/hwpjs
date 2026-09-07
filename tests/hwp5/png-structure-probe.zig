const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const count = try r.readInt(u32);
    const chunk_bytes = try r.readInt(u32);
    const pixels = try r.readInt(u64);
    const report = try core.image.png_structure.inspect(bytes[r.offset..], .{ .chunks = .{ .max_bytes = limit, .max_chunks = count, .max_chunk_bytes = chunk_bytes }, .max_pixels = pixels });
    const h = report.header;
    const values = [_]usize{ h.width, h.height, h.bit_depth, h.color_type, h.interlace, report.chunks, report.idat_chunks, report.idat_bytes, report.palette_entries, report.ancillary_chunks_deferred, report.ancillary_bytes_deferred, report.reserved_bit_chunks, @intFromBool(report.pixels_validated) };
    const out = try a.alloc(u8, values.len * 4);
    for (values, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    return out;
}
