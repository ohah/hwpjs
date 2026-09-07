const std = @import("std");
const structure = @import("structure.zig");
const zlib = @import("../../compression/zlib.zig");
const filter = @import("filter.zig");
const indices = @import("palette_indices.zig");
const metadata = @import("metadata.zig");
pub const Layout = @import("layout.zig").Layout;
pub const Options = struct { structure: structure.Options = .{}, max_decoded_bytes: usize = 256 * 1024 * 1024 };
pub const Report = struct {
    structure: structure.Report,
    decoded_bytes: usize,
    scanlines: usize,
    passes: usize,
    zlib_trailing_bytes: usize,
    reconstructed_crc32: u32,
    transparency: ?@import("transparency.zig").Value,
    background: ?@import("background.zig").Value,
    histogram: ?@import("histogram.zig").Value,
    histogram_usage_validated: bool,
    physical: ?@import("physical.zig").Value,
    significant_bits: ?@import("significant_bits.zig").Value,
    timestamp: ?@import("timestamp.zig").Value,
};
pub const Decoded = struct {
    report: Report,
    layout: Layout,
    /// Owned pass-order rows: each original filter byte followed by reconstructed
    /// packed bytes. Padding bits are preserved; not canonical RGBA pixels.
    bytes: []u8,
    pub fn deinit(self: *Decoded, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    var decoded = try decode(a, bytes, options);
    defer decoded.deinit(a);
    return decoded.report;
}
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Decoded {
    var envelope = try structure.inspect(bytes, options.structure);
    const layout = try Layout.init(envelope.header, options.max_decoded_bytes);
    const compressed = try a.alloc(u8, envelope.idat_bytes);
    defer a.free(compressed);
    var it = try structure.chunks.Iterator.init(bytes, options.structure.chunks);
    var at: usize = 0;
    var meta: metadata.State = .{};
    while (try it.next()) |chunk| {
        try meta.consume(envelope.header, envelope.palette_entries, chunk);
        if (chunk.is("IDAT")) {
            @memcpy(compressed[at..][0..chunk.payload.len], chunk.payload);
            at += chunk.payload.len;
        }
    }
    const decoded = try zlib.decodePrefix(a, compressed, layout.bytes);
    errdefer a.free(decoded.bytes);
    if (decoded.bytes.len != layout.bytes) return error.InvalidPngScanlineSize;
    var crc = std.hash.Crc32.init();
    const frequencies: ?[]const u16 = if (meta.histogram) |*hist| hist.frequencies[0..hist.count] else null;
    for (layout.passes[0..layout.count]) |pass| {
        if (pass.width == 0 or pass.height == 0) continue;
        var previous: ?[]const u8 = null;
        var offset = pass.offset;
        for (0..pass.height) |_| {
            const kind = decoded.bytes[offset];
            const row = decoded.bytes[offset + 1 ..][0..pass.row_bytes];
            try filter.restore(kind, layout.stride, row, previous);
            if (envelope.header.color_type == 3) try indices.inspectWithHistogram(row, pass.width, envelope.header.bit_depth, envelope.palette_entries, frequencies);
            crc.update(row);
            previous = row;
            offset += 1 + pass.row_bytes;
        }
    }
    envelope.pixels_validated = true;
    envelope.ancillary_chunks_deferred -= meta.validated_chunks;
    envelope.ancillary_bytes_deferred -= meta.validated_bytes;
    return .{
        .bytes = decoded.bytes,
        .layout = layout,
        .report = .{
            .structure = envelope,
            .decoded_bytes = layout.bytes,
            .scanlines = layout.rows,
            .passes = layout.nonempty_passes,
            .zlib_trailing_bytes = compressed.len - decoded.consumed,
            .reconstructed_crc32 = crc.final(),
            .transparency = meta.transparency,
            .background = meta.background,
            .histogram = meta.histogram,
            .histogram_usage_validated = meta.histogram != null and envelope.header.color_type == 3,
            .physical = meta.physical,
            .significant_bits = meta.significant_bits,
            .timestamp = meta.timestamp,
        },
    };
}
