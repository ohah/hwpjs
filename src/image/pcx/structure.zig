const std = @import("std");

pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_decoded_bytes: usize = 256 * 1024 * 1024,
};

pub const Report = struct {
    version: u8,
    width: usize,
    height: usize,
    bits_per_plane: u8,
    planes: u8,
    bytes_per_line: usize,
    decoded_bytes: usize,
    encoded_bytes: usize,
    has_vga_palette: bool,
    pixels_deferred: bool = true,
};

/// Validates the PCX header and exact RLE byte count without allocating a
/// pixel buffer. Runs may cross plane boundaries, but not scan lines.
pub fn inspect(bytes: []const u8, options: Options) !Report {
    if (bytes.len > options.max_bytes) return error.LimitExceeded;
    if (bytes.len < 128) return error.TruncatedPcxHeader;
    if (bytes[0] != 0x0a) return error.InvalidPcxManufacturer;
    const version = bytes[1];
    if (version != 0 and version != 2 and version != 3 and version != 4 and version != 5) return error.UnsupportedPcxVersion;
    if (bytes[2] != 1) return error.UnsupportedPcxEncoding;
    const bits = bytes[3];
    if (bits != 1 and bits != 2 and bits != 4 and bits != 8) return error.UnsupportedPcxDepth;
    const x_min = std.mem.readInt(u16, bytes[4..6], .little);
    const y_min = std.mem.readInt(u16, bytes[6..8], .little);
    const x_max = std.mem.readInt(u16, bytes[8..10], .little);
    const y_max = std.mem.readInt(u16, bytes[10..12], .little);
    if (x_max < x_min or y_max < y_min) return error.InvalidPcxDimensions;
    const width = @as(usize, x_max) - x_min + 1;
    const height = @as(usize, y_max) - y_min + 1;
    const planes = bytes[65];
    if (planes == 0 or planes > 4) return error.UnsupportedPcxPlanes;
    const bytes_per_line = std.mem.readInt(u16, bytes[66..68], .little);
    const minimum_line = (width * @as(usize, bits) + 7) / 8;
    if (bytes_per_line == 0 or bytes_per_line % 2 != 0 or bytes_per_line < minimum_line) return error.InvalidPcxBytesPerLine;
    const decoded_bytes = std.math.mul(usize, std.math.mul(usize, height, @as(usize, planes)) catch return error.LimitExceeded, bytes_per_line) catch return error.LimitExceeded;
    const scanline_bytes = @as(usize, planes) * bytes_per_line;
    if (decoded_bytes > options.max_decoded_bytes) return error.LimitExceeded;

    const palette = version == 5 and bits == 8 and planes == 1 and bytes.len >= 128 + 769 and bytes[bytes.len - 769] == 0x0c;
    const stream_end = if (palette) bytes.len - 769 else bytes.len;

    var cursor: usize = 128;
    var produced: usize = 0;
    while (produced < decoded_bytes) {
        if (cursor >= stream_end) return error.TruncatedPcxImage;
        const code = bytes[cursor];
        cursor += 1;
        var count: usize = 1;
        if (code & 0xc0 == 0xc0) {
            count = code & 0x3f;
            if (count == 0) return error.InvalidPcxRun;
            if (cursor >= stream_end) return error.TruncatedPcxRun;
            cursor += 1;
        }
        if (count > decoded_bytes - produced) return error.PcxRunOverrun;
        if (count > scanline_bytes - produced % scanline_bytes) return error.PcxRunCrossesScanLine;
        produced += count;
    }
    if (cursor != stream_end) return error.InvalidPcxTrailer;
    return .{
        .version = version,
        .width = width,
        .height = height,
        .bits_per_plane = bits,
        .planes = planes,
        .bytes_per_line = bytes_per_line,
        .decoded_bytes = decoded_bytes,
        .encoded_bytes = cursor - 128,
        .has_vga_palette = palette,
    };
}
