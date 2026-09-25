const std = @import("std");
const cfb = @import("cfb/reader.zig");
const Header = @import("hwp5/file_header.zig").Header;
const paths = @import("hwp5/container/paths.zig");
const records = @import("hwp5/docinfo/reader.zig");
const streams = @import("hwp5/bin_data_stream.zig");
const jpeg = @import("hwp5/container/jpeg_images.zig");

const jpeg_options: jpeg.Options = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };

fn inspectFile(a: std.mem.Allocator, path: []const u8, expected_rgb: []const usize) !void {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try Header.parse(file.entries[header_index].content);
    const doc_index = try paths.required(&file, "/DocInfo", 2);
    const doc = try @import("hwp5/stream.zig").decode(a, &header, file.entries[doc_index].content, 64 * 1024 * 1024);
    defer a.free(doc);
    var it = try records.Iterator.init(doc, header.version(), .{});
    var mismatches: usize = 0;
    while (try it.next()) |record| {
        if (record.value != .bin_data) continue;
        const item = record.value.bin_data;
        const target = try item.target(.observed_optional_extension) orelse continue;
        const ext = target.extension_utf16 orelse continue;
        if (!@import("hwp5/container/extension.zig").is(ext, "png")) continue;
        const name = try paths.binary(a, target.id, ext);
        defer a.free(name);
        const index = try paths.required(&file, name, 2);
        const decoded = try streams.decode(a, &header, item, file.entries[index].content, 64 * 1024 * 1024);
        defer a.free(decoded);
        if (!std.mem.startsWith(u8, decoded, &.{ 0xff, 0xd8 })) continue;
        const result = try jpeg.inspect(a, decoded, jpeg_options, 256 * 1024 * 1024);
        try std.testing.expect(mismatches < expected_rgb.len);
        try std.testing.expectEqual(expected_rgb[mismatches], result.rgb_bytes);
        try std.testing.expectEqual(@as(usize, 1), result.scans);
        mismatches += 1;
    }
    try std.testing.expectEqual(expected_rgb.len, mismatches);
}

test "HWP PNG-declared JPEG known corpus is fully decodable" {
    const a = std.testing.allocator;
    try inspectFile(a, "reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp", &.{ 2_597_778, 7_825_116 });
    try inspectFile(a, "reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp", &.{41_772});
}

test "HWP PNG-declared JPEG known documents connect whole container" {
    const a = std.testing.allocator;
    const document_options: @import("hwp5/document/types.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    const cases = [_]struct { path: []const u8, decoded: usize, mismatches: usize, jpeg_images: usize, rgb: usize, png_images: usize, unhandled: usize }{
        .{ .path = "reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp", .decoded = 10, .mismatches = 2, .jpeg_images = 3, .rgb = 21_288_063, .png_images = 0, .unhandled = 7 },
        .{ .path = "reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp", .decoded = 2, .mismatches = 1, .jpeg_images = 1, .rgb = 41_772, .png_images = 1, .unhandled = 0 },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(2 * 1024 * 1024));
        defer a.free(bytes);
        try std.testing.expectError(error.InvalidPngSignature, @import("hwp5/container/validation.zig").inspect(a, bytes, .{
            .document = document_options,
            .images = .{ .jpeg = jpeg_options },
        }));
        var report = try @import("hwp5/container/validation.zig").inspect(a, bytes, .{
            .document = document_options,
            .images = .{ .jpeg = jpeg_options, .png_declared_jpeg = .inspect_jpeg },
        });
        defer report.deinit(a);
        try std.testing.expectEqual(case.decoded, report.binary_data.decoded);
        try std.testing.expectEqual(case.mismatches, report.images.?.png_declared_jpeg_images);
        try std.testing.expectEqual(case.jpeg_images, report.images.?.jpeg.images);
        try std.testing.expectEqual(case.rgb, report.images.?.jpeg.rgb_bytes);
        try std.testing.expectEqual(case.png_images, report.images.?.png_images);
        try std.testing.expectEqual(case.unhandled, report.images.?.unhandled_binaries);
        try std.testing.expect(report.images.?.semantics_deferred);
    }
}
