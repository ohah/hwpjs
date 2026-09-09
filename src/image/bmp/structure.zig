const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const file_header = @import("file_header.zig");
const dib = @import("header.zig");
const Channels = @import("masks.zig").Channels;
const Palette = @import("palette.zig").Palette;
pub const Options = struct {
    header: dib.Options = .{},
    max_bytes: usize = 64 * 1024 * 1024,
    max_palette_entries: usize = 65536,
    max_pixel_bytes: usize = 256 * 1024 * 1024,
    allow_trailing_bytes: bool = false,
};
pub const View = struct {
    file: file_header.Header,
    header: dib.Header,
    palette: Palette,
    channels: ?Channels,
    stride: usize,
    pixels: []const u8,
    gap: []const u8,
    /// Includes V5 profile transport, which is not interpreted by this layer.
    after_pixels: []const u8,
    trailing: []const u8,
    metadata_deferred: bool = true,
};
pub fn rowStride(width: u32, bits: u16) u64 {
    return ((@as(u64, width) * bits + 31) / 32) * 4;
}
pub fn inspect(bytes: []const u8, options: Options) !View {
    if (bytes.len > options.max_bytes) return error.LimitExceeded;
    const file = try file_header.parse(bytes);
    if (file.size > bytes.len) return error.UnexpectedEnd;
    if (file.size < file_header.byte_size) return error.InvalidBmpFileSize;
    if (!options.allow_trailing_bytes and file.size != bytes.len) return error.TrailingBmpBytes;
    const bounded = bytes[0..file.size];
    const header = try dib.parse(bounded[file_header.byte_size..], options.header);
    var r: Reader = .{ .bytes = bounded, .offset = file_header.byte_size + header.raw.len };
    var channels: ?Channels = null;
    if (header.compression == .bitfields) {
        var masks: [4]u32 = .{ 0, 0, 0, 0 };
        if (header.colour) |colour| {
            masks = colour.masks;
        } else {
            for (masks[0..3]) |*mask| mask.* = try r.readInt(u32);
        }
        channels = try Channels.init(masks, header.bit_count);
    } else if (header.compression == .rgb and header.bit_count == 16) {
        channels = try Channels.init(.{ 0x7c00, 0x03e0, 0x001f, 0 }, 16);
    }
    const count = header.paletteCount();
    if (count > options.max_palette_entries) return error.LimitExceeded;
    const entry_bytes: u8 = if (header.kind == .core) 3 else 4;
    const palette_bytes = @as(u64, count) * entry_bytes;
    if (palette_bytes > std.math.maxInt(usize)) return error.LimitExceeded;
    const palette = try Palette.init(try r.take(@intCast(palette_bytes)), entry_bytes);
    if (file.pixels_offset < r.offset or file.pixels_offset > file.size) return error.InvalidBmpPixelOffset;
    const stride = if (header.uncompressed()) rowStride(header.width, header.bit_count) else 0;
    const declared = if (header.info) |info| info.image_bytes else 0;
    const size: u64 = if (header.uncompressed()) stride * header.height else declared;
    if (header.uncompressed()) {
        if (declared != 0 and declared != size) return error.InvalidBmpImageSize;
        if (header.compression == .bitfields and declared == 0) return error.InvalidBmpImageSize;
    } else if (declared == 0) return error.InvalidBmpImageSize;
    if (size > options.max_pixel_bytes or size > std.math.maxInt(usize) or stride > std.math.maxInt(usize)) return error.LimitExceeded;
    const gap = bounded[r.offset..file.pixels_offset];
    r.offset = file.pixels_offset;
    const pixels = try r.take(@intCast(size));
    return .{ .file = file, .header = header, .palette = palette, .channels = channels, .stride = @intCast(stride), .pixels = pixels, .gap = gap, .after_pixels = bounded[r.offset..], .trailing = bytes[file.size..] };
}
