const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const container = @import("validation.zig");
const fixture = @import("image_fixture.zig");

const document_options: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };

fn padded(a: std.mem.Allocator) ![]u8 {
    const valid = try @import("../../image/png/pixels_fixture.zig").image(a, 0);
    defer a.free(valid);
    return std.mem.concat(a, u8, &.{ valid, &.{ 0, 0 } });
}

fn selected() images.Options {
    return .{
        .png = .{ .structure = .{ .post_iend = .{ .zero_padding = 2 } } },
        .max_total_png_post_iend_zero_bytes = 4,
    };
}

test "HWP PNG post-IEND budget counts repeated references atomically" {
    const bytes = try padded(t.allocator);
    defer t.allocator.free(bytes);
    var strict: images.Budget = .{ .options = .{} };
    try t.expectError(error.TrailingData, strict.consume(t.allocator, bytes, &.{ 'p', 0, 'n', 0, 'g', 0 }));
    try t.expectEqual(@as(usize, 0), strict.report.binaries);

    var budget: images.Budget = .{ .options = selected() };
    try budget.consume(t.allocator, bytes, &.{ 'p', 0, 'n', 0, 'g', 0 });
    try budget.consume(t.allocator, bytes, &.{ 'p', 0, 'n', 0, 'g', 0 });
    try t.expectEqual(@as(usize, 2), budget.report.png_images);
    try t.expectEqual(@as(usize, 2), budget.report.png_post_iend_zero_images);
    try t.expectEqual(@as(usize, 4), budget.report.png_post_iend_zero_bytes);
    try t.expectEqual(@as(usize, 4), budget.report.pixel_bytes);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, bytes, null));
    try t.expectEqualDeep(before, budget.report);

    var nonzero = try t.allocator.dupe(u8, bytes);
    defer t.allocator.free(nonzero);
    nonzero[nonzero.len - 1] = 1;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, nonzero, &.{ 'p', 0, 'n', 0, 'g', 0 }));
    try t.expectEqualDeep(before, budget.report);
    var fresh: images.Budget = .{ .options = selected() };
    try t.expectError(error.TrailingData, fresh.consume(t.allocator, nonzero, &.{ 'p', 0, 'n', 0, 'g', 0 }));
    try t.expectEqual(@as(usize, 0), fresh.report.binaries);

    fresh.options.png.structure.post_iend = .{ .zero_padding = 1 };
    try t.expectError(error.LimitExceeded, fresh.consume(t.allocator, bytes, &.{ 'p', 0, 'n', 0, 'g', 0 }));
    fresh.options.png.structure.post_iend = .{ .zero_padding = 2 };
    try t.expectError(error.InvalidPngSignature, fresh.consume(t.allocator, &.{ 0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0 }, &.{ 'p', 0, 'n', 0, 'g', 0 }));
    try t.expectEqual(@as(usize, 0), fresh.report.binaries);
}

fn inspectContainer(a: std.mem.Allocator, bytes: []const u8) !void {
    var options = document_options;
    options.images = selected();
    var report = try container.inspect(a, bytes, options);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, 2), report.images.?.png_images);
    try t.expectEqual(@as(usize, 4), report.images.?.png_post_iend_zero_bytes);
    try t.expectEqual(@as(usize, 2), report.images.?.png_post_iend_zero_images);
    try t.expect(report.images.?.semantics_deferred);
}

test "HWP container PNG post-IEND policy follows exact BinData references" {
    const image = try padded(t.allocator);
    defer t.allocator.free(image);
    const bytes = try fixture.make(t.allocator, image, 2);
    defer t.allocator.free(bytes);
    var strict = document_options;
    strict.images = .{};
    try t.expectError(error.TrailingData, container.inspect(t.allocator, bytes, strict));
    try inspectContainer(t.allocator, bytes);
    try t.checkAllAllocationFailures(t.allocator, inspectContainer, .{bytes});
    var limited = document_options;
    limited.images = selected();
    limited.images.?.max_total_png_post_iend_zero_bytes = 3;
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, limited));
    limited.images.?.max_total_png_post_iend_zero_bytes = 0;
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, limited));
}
