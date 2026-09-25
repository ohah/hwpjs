const std = @import("std");
const container = @import("hwp5/container/validation.zig");
const cfb = @import("cfb/reader.zig");
const Header = @import("hwp5/file_header.zig").Header;
const paths = @import("hwp5/container/paths.zig");
const streams = @import("hwp5/bin_data_stream.zig");
const records = @import("hwp5/docinfo/reader.zig");
const bmp = @import("image/bmp/pixels.zig");

const file_path = "reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp";
const bmp_options: bmp.Options = .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized };
const document_options: @import("hwp5/document/types.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };

const expected = [_]struct { path: []const u8, encoded: usize, rgba: usize, crc: u32, ff: usize, other: usize }{
    .{ .path = "/BinData/BIN0002.bmp", .encoded = 3_912_246, .rgba = 3_912_192, .crc = 3_328_180_045, .ff = 976_053, .other = 1_995 },
    .{ .path = "/BinData/BIN0005.bmp", .encoded = 43_214, .rgba = 43_160, .crc = 3_238_137_512, .ff = 10_368, .other = 422 },
    .{ .path = "/BinData/BIN0006.bmp", .encoded = 48_598, .rgba = 48_544, .crc = 2_316_897_933, .ff = 11_664, .other = 472 },
    .{ .path = "/BinData/BIN0007.bmp", .encoded = 69_398, .rgba = 69_344, .crc = 3_207_307_936, .ff = 16_879, .other = 457 },
    .{ .path = "/BinData/BIN0008.bmp", .encoded = 59_694, .rgba = 59_640, .crc = 543_781_140, .ff = 14_560, .other = 350 },
    .{ .path = "/BinData/BIN0009.bmp", .encoded = 78_954, .rgba = 78_900, .crc = 1_962_280_315, .ff = 19_314, .other = 411 },
    .{ .path = "/BinData/BIN000A.bmp", .encoded = 57_914, .rgba = 57_860, .crc = 1_926_907_482, .ff = 14_042, .other = 423 },
};

test "HWP known seven BMP declarations inspect with existing decoder" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_path, a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    const images = @import("hwp5/container/images.zig");
    const options: images.Options = .{
        .jpeg = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } },
        .png_declared_jpeg = .inspect_jpeg,
        .bmp = bmp_options,
    };
    var unselected = try container.inspect(a, bytes, .{ .document = document_options, .images = .{ .jpeg = options.jpeg, .png_declared_jpeg = .inspect_jpeg } });
    defer unselected.deinit(a);
    try std.testing.expectEqual(@as(usize, 7), unselected.images.?.unhandled_binaries);
    var report = try container.inspect(a, bytes, .{
        .document = document_options,
        .images = options,
    });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 10), report.binary_data.decoded);
    try std.testing.expectEqual(@as(usize, 7), report.images.?.bmp.images);
    try std.testing.expectEqual(@as(usize, 4_269_640), report.images.?.bmp.rgba_bytes);
    try std.testing.expectEqual(@as(usize, 7), report.images.?.bmp.rgb32_high_byte_images);
    try std.testing.expectEqual(@as(usize, 0), report.images.?.bmp.rgb32_high_byte_zero);
    try std.testing.expectEqual(@as(usize, 1_062_880), report.images.?.bmp.rgb32_high_byte_ff);
    try std.testing.expectEqual(@as(usize, 4_530), report.images.?.bmp.rgb32_high_byte_other);
    try std.testing.expectEqual(@as(usize, 3), report.images.?.jpeg.images);
    try std.testing.expectEqual(@as(usize, 2), report.images.?.png_declared_jpeg_images);
    try std.testing.expectEqual(@as(usize, 0), report.images.?.unhandled_binaries);
    try std.testing.expect(report.images.?.semantics_deferred);
    var capped = options;
    capped.max_total_bmp_rgba_bytes = 4_269_639;
    try std.testing.expectError(error.LimitExceeded, container.inspect(a, bytes, .{ .document = document_options, .images = capped }));
}

test "HWP known seven BMP payloads match independent RGBA CRCs" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_path, a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try Header.parse(file.entries[header_index].content);
    const doc_index = try paths.required(&file, "/DocInfo", 2);
    const doc = try @import("hwp5/stream.zig").decode(a, &header, file.entries[doc_index].content, 64 * 1024 * 1024);
    defer a.free(doc);
    var it = try records.Iterator.init(doc, header.version(), .{});
    var count: usize = 0;
    while (try it.next()) |record| {
        if (record.value != .bin_data) continue;
        const item = record.value.bin_data;
        const target = try item.target(.observed_optional_extension) orelse continue;
        const ext = target.extension_utf16 orelse continue;
        if (!@import("hwp5/container/extension.zig").is(ext, "bmp")) continue;
        try std.testing.expect(count < expected.len);
        const entry = expected[count];
        const name = try paths.binary(a, target.id, ext);
        defer a.free(name);
        try std.testing.expect(std.ascii.eqlIgnoreCase(entry.path, name));
        const index = try paths.required(&file, name, 2);
        const decoded = try streams.decode(a, &header, item, file.entries[index].content, 64 * 1024 * 1024);
        defer a.free(decoded);
        try std.testing.expectEqual(entry.encoded, decoded.len);
        var image = try bmp.decode(a, decoded, bmp_options);
        defer image.deinit(a);
        try std.testing.expectEqual(entry.rgba, image.rgba.len);
        try std.testing.expectEqual(entry.crc, std.hash.Crc32.hash(image.rgba));
        const raw_view = try @import("image/bmp/structure.zig").inspect(decoded, bmp_options.structure);
        const high_byte = @import("image/bmp/rgb32_high_byte.zig").inspect(raw_view);
        try std.testing.expectEqual(@as(usize, 1), high_byte.images);
        try std.testing.expectEqual(@as(usize, 0), high_byte.zero);
        try std.testing.expectEqual(entry.ff, high_byte.ff);
        try std.testing.expectEqual(entry.other, high_byte.other);
        count += 1;
    }
    try std.testing.expectEqual(expected.len, count);
}
