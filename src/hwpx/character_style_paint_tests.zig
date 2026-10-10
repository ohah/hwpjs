const std = @import("std");
const paint = @import("character_style_paint.zig");
test "HWPX character style paint splits current text without changing provenance and is allocation atomic" {
    const a = std.testing.allocator;
    var rows = [_]@import("text_sites.zig").Site{.{ .element_index = 3, .start = 10, .end = 11, .text = @constCast("A😀B") }};
    const sites: @import("text_sites.zig").Sites = .{ .items = &rows };
    const original = [_]paint.Span{.{ .start_unit = 0, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 }};
    const result = try paint.prepare(a, &sites, &original, 1, 3, 9, &.{ 7, 9 }, 3);
    defer a.free(result);
    try std.testing.expectEqual(@as(usize, 3), result.len);
    try std.testing.expectEqual(@as(?u32, 9), result[1].char_shape_id);
    try std.testing.expectEqual(@as(usize, 1), result[1].start_unit);
    try std.testing.expectEqual(@as(usize, 3), result[1].end_unit);
    for (result) |span| try std.testing.expectEqual(@as(usize, 2), span.run_element);
    const restored = try paint.prepare(a, &sites, result, 0, 4, 7, &.{ 7, 9 }, 3);
    defer a.free(restored);
    try std.testing.expectEqualSlices(paint.Span, &original, restored);
    try std.testing.expectError(error.SplitSurrogatePair, paint.prepare(a, &sites, &original, 1, 2, 9, &.{ 7, 9 }, 3));
    try std.testing.expectError(error.SplitSurrogatePair, paint.prepare(a, &sites, &original, 2, 2, 9, &.{ 7, 9 }, 3));
    var stale = original;
    stale[0].end_unit = 1;
    try std.testing.expectError(error.InvalidTextSites, paint.prepare(a, &sites, &stale, 0, 1, 9, &.{ 7, 9 }, 3));
    try std.testing.expectError(error.InvalidResourceReference, paint.prepare(a, &sites, &original, 0, 1, 8, &.{ 7, 9 }, 3));
    try std.testing.expectError(error.LimitExceeded, paint.prepare(a, &sites, &original, 1, 3, 9, &.{ 7, 9 }, 2));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("text_sites.zig").Sites, spans: []const paint.Span) !void {
            const draft = try paint.prepare(allocator, s, spans, 1, 3, 9, &.{ 7, 9 }, 3);
            defer allocator.free(draft);
        }
    }.run, .{ &sites, &original });
    try std.testing.expectEqualStrings("A😀B", rows[0].text);
    try std.testing.expectEqual(@as(?u32, 7), original[0].char_shape_id);
}

test "HWPX character style paint never merges different run provenance with equal IDs" {
    const a = std.testing.allocator;
    var rows = [_]@import("text_sites.zig").Site{
        .{ .element_index = 3, .start = 10, .end = 11, .text = @constCast("A") },
        .{ .element_index = 6, .start = 20, .end = 21, .text = @constCast("B") },
    };
    const sites: @import("text_sites.zig").Sites = .{ .items = &rows };
    const current = [_]paint.Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = null },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = 1, .run_element = 5, .char_shape_id = 7 },
    };
    const changed = try paint.prepare(a, &sites, &current, 0, 2, 9, &.{ 7, 9 }, 2);
    defer a.free(changed);
    try std.testing.expectEqual(@as(usize, 2), changed.len);
    try std.testing.expectEqual(@as(usize, 2), changed[0].run_element);
    try std.testing.expectEqual(@as(usize, 5), changed[1].run_element);
    const unchanged = try paint.prepare(a, &sites, &current, 1, 1, 9, &.{ 7, 9 }, 2);
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(paint.Span, &current, unchanged);
}
