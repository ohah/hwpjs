const std = @import("std");
test "HWPX character style model owns bounded clone independently from current text" {
    const a = std.testing.allocator;
    const model = @import("paragraph_structure_values.zig");
    const Span = @import("character_style_paint.zig").Span;
    const sites = try a.alloc(@import("text_sites.zig").Site, 1);
    sites[0] = .{ .element_index = 3, .start = 10, .end = 20, .text = try a.dupe(u8, "A😀B") };
    const styles = try a.alloc(Span, 1);
    styles[0] = .{ .start_unit = 0, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 };
    const paragraphs = try a.alloc(model.Paragraph, 1);
    paragraphs[0] = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = sites }, .character_styles = styles };
    var values: model.Values = .{ .paragraphs = paragraphs };
    defer values.deinit(a);
    var copy = try values.clone(a);
    defer copy.deinit(a);
    styles[0].char_shape_id = 9;
    try std.testing.expectEqual(@as(?u32, 7), copy.paragraphs[0].character_styles.?[0].char_shape_id);
    try std.testing.expectEqualStrings("A😀B", copy.paragraphs[0].sites.items[0].text);
    const total = try values.byteSize(10000);
    try std.testing.expectError(error.LimitExceeded, values.byteSize(total - 1));
    try std.testing.expectEqual(total, try copy.byteSize(total));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const model.Values) !void {
            var cloned = try original.clone(allocator);
            defer cloned.deinit(allocator);
        }
    }.run, .{&values});
    try std.testing.expectEqual(@as(?u32, 9), styles[0].char_shape_id);
}
