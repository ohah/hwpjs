const std = @import("std");
const images = @import("images.zig");
const fixture = @import("../../image/png/pixels_fixture.zig");

fn selected(a: std.mem.Allocator, encoded: []const u8, options: images.Options) !images.Report {
    var budget: images.Budget = .{ .options = options };
    try budget.consume(a, encoded, &.{ 'p', 0, 'n', 0, 'g', 0 });
    try budget.consume(a, encoded, &.{ 'p', 0, 'n', 0, 'g', 0 });
    return budget.report;
}

test "HWP PNG RGBA selection has independent cumulative and per-image budgets" {
    const a = std.testing.allocator;
    const encoded = try fixture.withTransparency(a, 0, &.{128});
    defer a.free(encoded);
    const strict = try selected(a, encoded, .{ .max_total_png_rgba_bytes = 0 });
    try std.testing.expectEqual(@as(usize, 2), strict.png_images);
    try std.testing.expectEqual(@as(usize, 4), strict.pixel_bytes);
    try std.testing.expectEqual(@as(usize, 0), strict.png_rgba_images);
    try std.testing.expectEqual(@as(usize, 0), strict.png_rgba_bytes);
    const checked = try selected(a, encoded, .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 8, .max_total_pixel_bytes = 4 });
    try std.testing.expectEqual(@as(usize, 2), checked.png_rgba_images);
    try std.testing.expectEqual(@as(usize, 8), checked.png_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 4), checked.pixel_bytes);
    try std.testing.expect(checked.semantics_deferred);
    try std.testing.expectError(error.LimitExceeded, selected(a, encoded, .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 7 }));
    try std.testing.expectError(error.LimitExceeded, selected(a, encoded, .{ .png_pixels = .{ .max_rgba_bytes = 3 } }));
    try std.testing.expectError(error.LimitExceeded, selected(a, encoded, .{ .png_pixels = .{}, .max_total_pixel_bytes = 3 }));
}

test "HWP PNG RGBA budget remains atomic after a failed second reference" {
    const a = std.testing.allocator;
    const encoded = try fixture.image(a, 0);
    defer a.free(encoded);
    var budget: images.Budget = .{ .options = .{ .png_pixels = .{}, .max_total_png_rgba_bytes = 7 } };
    try budget.consume(a, encoded, null);
    const before = budget.report;
    try std.testing.expectError(error.LimitExceeded, budget.consume(a, encoded, null));
    try std.testing.expectEqualDeep(before, budget.report);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, png: []const u8) !void {
            _ = try selected(allocator, png, .{ .png_pixels = .{} });
        }
    }.run, .{encoded});
}
