const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const container = @import("validation.zig");
const fixture = @import("image_fixture.zig");
const jpeg_fixture = @import("jpeg_image_fixture.zig");

const jpeg_options: @import("jpeg_images.zig").Options = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };
const document_options: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
const png_extension = &[_]u8{ 'p', 0, 'n', 0, 'g', 0 };

fn selected() images.Options {
    return .{ .jpeg = jpeg_options, .png_declared_jpeg = .inspect_jpeg, .max_total_jpeg_rgb_bytes = 6 };
}

test "HWP PNG-declared JPEG selection requires real JPEG and retains separate evidence" {
    var strict: images.Budget = .{ .options = .{ .jpeg = jpeg_options } };
    try t.expectError(error.InvalidPngSignature, strict.consume(t.allocator, &jpeg_fixture.sequential, png_extension));
    try t.expectEqualDeep(images.Report{}, strict.report);

    var without_jpeg: images.Budget = .{ .options = .{ .png_declared_jpeg = .inspect_jpeg } };
    try t.expectError(error.MissingJpegInspector, without_jpeg.consume(t.allocator, &jpeg_fixture.sequential, png_extension));
    try t.expectEqualDeep(images.Report{}, without_jpeg.report);

    var budget: images.Budget = .{ .options = selected() };
    try budget.consume(t.allocator, &jpeg_fixture.sequential, png_extension);
    try budget.consume(t.allocator, &jpeg_fixture.progressive, png_extension);
    try t.expectEqual(@as(usize, 2), budget.report.jpeg.images);
    try t.expectEqual(@as(usize, 2), budget.report.jpeg.extension_disagreements);
    try t.expectEqual(@as(usize, 2), budget.report.png_declared_jpeg_images);
    try t.expectEqual(@as(usize, 6), budget.report.jpeg.rgb_bytes);
    try t.expectEqual(@as(usize, 0), budget.report.png_images);
    try t.expectEqual(@as(usize, 0), budget.report.pixel_bytes);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &jpeg_fixture.sequential, png_extension));
    try t.expectEqualDeep(before, budget.report);

    var malformed = jpeg_fixture.sequential;
    malformed[malformed.len - 3] &= 0xfe;
    var fresh: images.Budget = .{ .options = selected() };
    try t.expectError(error.InvalidJpegEntropyPadding, fresh.consume(t.allocator, &malformed, png_extension));
    try t.expectEqualDeep(images.Report{}, fresh.report);
    try t.expectError(error.InvalidPngSignature, fresh.consume(t.allocator, "not-an-image", png_extension));
    try t.expectEqualDeep(images.Report{}, fresh.report);

    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    try fresh.consume(t.allocator, png, png_extension);
    try t.expectEqual(@as(usize, 1), fresh.report.png_images);
    try t.expectEqual(@as(usize, 0), fresh.report.png_declared_jpeg_images);
}

fn inspectContainer(a: std.mem.Allocator, bytes: []const u8) !void {
    var options = document_options;
    options.images = selected();
    var report = try container.inspect(a, bytes, options);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, 2), report.images.?.png_declared_jpeg_images);
    try t.expectEqual(@as(usize, 2), report.images.?.jpeg.images);
    try t.expectEqual(@as(usize, 6), report.images.?.jpeg.rgb_bytes);
    try t.expectEqual(@as(usize, 0), report.images.?.png_images);
    try t.expect(report.images.?.semantics_deferred);
}

test "HWP container PNG-declared JPEG selection follows exact BinData path and is atomic" {
    const bytes = try fixture.withExtension(t.allocator, &jpeg_fixture.sequential, 2, "png");
    defer t.allocator.free(bytes);
    var strict = document_options;
    strict.images = .{ .jpeg = jpeg_options };
    try t.expectError(error.InvalidPngSignature, container.inspect(t.allocator, bytes, strict));
    try inspectContainer(t.allocator, bytes);
    try t.checkAllAllocationFailures(t.allocator, inspectContainer, .{bytes});
    var limited = document_options;
    limited.images = selected();
    limited.images.?.max_total_jpeg_rgb_bytes = 5;
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, limited));
}
