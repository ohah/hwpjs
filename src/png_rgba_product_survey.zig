const std = @import("std");

const document_options: @import("hwp5/document/types.zig").Options = .{
    .list_layout = .observed8,
    .zone_layout = .observed_row_first,
    .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
};

test "PNG RGBA known HWP BinData keeps format and output budgets separate" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    const inspect = @import("hwp5/container/validation.zig").inspect;
    const jpeg: @import("hwp5/container/jpeg_images.zig").Options = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };
    var report = try inspect(a, bytes, .{ .document = document_options, .images = .{ .jpeg = jpeg, .png_declared_jpeg = .inspect_jpeg, .png_pixels = .{} } });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.png_images);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.png_rgba_images);
    try std.testing.expectEqual(@as(usize, 153_664), report.images.?.png_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.png_declared_jpeg_images);
    try std.testing.expectError(error.LimitExceeded, inspect(a, bytes, .{ .document = document_options, .images = .{ .jpeg = jpeg, .png_declared_jpeg = .inspect_jpeg, .png_pixels = .{}, .max_total_png_rgba_bytes = 153_663 } }));
}

test "PNG RGBA known HWPX manifest candidate uses the selected output path" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5595_rotated_picture_topbottom.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{ .png_pixels = .{} });
    defer report.deinit(a);
    var png_count: usize = 0;
    for (report.targets) |target| {
        if (target.format != .png) continue;
        png_count += 1;
        try std.testing.expectEqual(@import("hwpx/image_payloads.zig").Inspection.png_rgba, target.inspection);
        try std.testing.expectEqual(@as(?anyerror, null), target.inspection_error);
    }
    try std.testing.expectEqual(@as(usize, 1), png_count);
    try std.testing.expectEqual(@as(usize, 256), report.png_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 200), report.png_decoded_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestImagePayloads(a, .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 255 }));
}

// Binary stdout is consumed only by tools/png-rgba-product-diff.py.
test "PNG RGBA raw HWP BinData stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var file = try @import("cfb/reader.zig").File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const Header = @import("hwp5/file_header.zig").Header;
    const header = try Header.parse(file.entries[(try file.findExact("/FileHeader")).?].content);
    const doc = try @import("hwp5/stream.zig").decode(a, &header, file.entries[(try file.findExact("/DocInfo")).?].content, 64 * 1024 * 1024);
    defer a.free(doc);
    var records = try @import("hwp5/docinfo/reader.zig").Iterator.init(doc, header.version(), .{});
    while (try records.next()) |record| {
        if (record.value != .bin_data) continue;
        const item = record.value.bin_data;
        const target = try item.target(.observed_optional_extension) orelse continue;
        if (target.id != 1) continue;
        const path = try @import("hwp5/container/paths.zig").binary(a, target.id, target.extension_utf16 orelse continue);
        defer a.free(path);
        const stored = file.entries[(try file.findExact(path)).?].content;
        const png = try @import("hwp5/bin_data_stream.zig").decode(a, &header, item, stored, 64 * 1024 * 1024);
        defer a.free(png);
        var image = try @import("image/png/rgba.zig").decode(a, png, .{});
        defer image.deinit(a);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgba);
        return;
    }
    return error.MissingPngFixture;
}

test "PNG RGBA raw HWPX BinData stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5595_rotated_picture_topbottom.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for (document.archive.entries) |entry| {
        if (!std.mem.eql(u8, entry.name, "BinData/image1.png")) continue;
        const png = try document.archive.decode(entry, 1_000_000);
        defer document.archive.allocator.free(png);
        var image = try @import("image/png/rgba.zig").decode(a, png, .{});
        defer image.deinit(a);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgba);
        return;
    }
    return error.MissingPngFixture;
}
