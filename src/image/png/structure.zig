pub const chunks = @import("chunks.zig");
pub const Header = @import("header.zig").Header;
pub const Options = struct { chunks: chunks.Options = .{}, max_pixels: u64 = 100_000_000 };
pub const Report = struct {
    header: Header,
    chunks: usize = 1,
    idat_chunks: usize = 0,
    idat_bytes: usize = 0,
    palette_entries: usize = 0,
    ancillary_chunks_deferred: usize = 0,
    ancillary_bytes_deferred: usize = 0,
    reserved_bit_chunks: usize = 0,
    pixels_validated: bool = false,
};
/// Critical envelope/order and CRC validation only. Does not inflate IDAT,
/// validate pixels/ancillary metadata/APNG, or return a fully validated PNG claim.
pub fn inspect(bytes: []const u8, options: Options) !Report {
    var it = try chunks.Iterator.init(bytes, options.chunks);
    const first = try it.next() orelse return error.MissingPngHeader;
    if (!first.is("IHDR")) return error.MissingPngHeader;
    var report: Report = .{ .header = try Header.parse(first.payload) };
    if (report.header.pixels() > options.max_pixels) return error.LimitExceeded;
    var idat_finished = false;
    while (try it.next()) |chunk| {
        report.chunks += 1;
        if (chunk.is("IHDR")) return error.DuplicatePngHeader;
        if (chunk.is("PLTE")) {
            if (report.palette_entries != 0 or report.idat_chunks != 0) return error.InvalidPngPaletteOrder;
            report.palette_entries = try report.header.palette(chunk.payload);
        } else if (chunk.is("IDAT")) {
            if (idat_finished) return error.NonconsecutivePngIdat;
            if (report.header.color_type == 3 and report.palette_entries == 0) return error.MissingPngPalette;
            report.idat_chunks += 1;
            report.idat_bytes += chunk.payload.len;
        } else if (chunk.is("IEND")) {
            if (chunk.payload.len != 0) return error.InvalidPngEnd;
            if (report.idat_chunks == 0) return error.MissingPngIdat;
            if (it.reader.offset != bytes.len) return error.TrailingData;
            return report;
        } else {
            if (chunk.critical()) return error.UnsupportedPngCriticalChunk;
            report.ancillary_chunks_deferred += 1;
            report.ancillary_bytes_deferred += chunk.payload.len;
            report.reserved_bit_chunks += @intFromBool(chunk.reserved());
            if (report.idat_chunks != 0) idat_finished = true;
        }
    }
    return error.MissingPngEnd;
}
