const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const presentation = @import("section_presentation.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: presentation.Options) !presentation.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return presentation.inspect(a, &.{tree}, options);
}

test "HWPX section presentation retains all six fields and direct brushes" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++ "<p:secPr>" ++
        "<p:presentation effect=' overLeft ' soundIDRef='' invertText='true' autoshow='0' showtime='&#43;8' applyto='NewSection'>" ++
        "<c:fillBrush><c:gradation/></c:fillBrush><c:fillBrush><c:winBrush/></c:fillBrush></p:presentation>" ++
        "<p:presentation effect='FUTURE' applyto='FUTURE'/><p:presentation/>" ++
        "</p:secPr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.items.len);
    try std.testing.expectEqual(@as(usize, 2), report.fill_brushes.len);
    try std.testing.expectEqual(@as(usize, 2), report.unknown_enums);
    try std.testing.expectEqualStrings(" overLeft ", report.items[0].get(.effect).?);
    try std.testing.expectEqualStrings("", report.items[0].get(.sound_id_ref).?);
    try std.testing.expectEqualStrings("+8", report.items[0].get(.showtime).?);
    try std.testing.expectEqualStrings("NewSection", report.items[0].get(.applyto).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.items[2].get(.effect));
    try std.testing.expectEqual(@as(usize, 2), report.items[0].fill_brushes);
    try std.testing.expectEqual(@as(usize, 1), report.fill_brushes[0].direct_children);
    try std.testing.expectEqual(@as(usize, 0), report.fill_brushes[0].presentation_index);
    try std.testing.expect(report.fill_brushes[0].element_index > report.items[0].element_index);
}

test "HWPX section presentation keeps namespace and ancestry boundaries" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++ "<p:secPr xmlns:x='urn:foreign'>" ++
        "<x:presentation/><p:wrapper><p:presentation/></p:wrapper>" ++
        "<p:presentation xmlns:y='urn:other' y:effect='wrong' effect='none' other='x'>" ++
        "<x:fillBrush/><p:wrapper><c:fillBrush/></p:wrapper><c:fillBrush extra='x'/></p:presentation>" ++
        "</p:secPr><p:presentation effect='random'/>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.items.len);
    try std.testing.expectEqual(@as(usize, 1), report.fill_brushes.len);
    try std.testing.expectEqual(@as(usize, 3), report.items[0].direct_children);
    try std.testing.expectEqual(@as(usize, 3), report.other_attributes);
    try std.testing.expectEqualStrings("none", report.items[0].get(.effect).?);
    try std.testing.expectEqual(@as(usize, 1), report.fill_brushes[0].other_attributes);
}

test "HWPX section presentation validates scalar lexicals and exact budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, prefix ++ "<p:secPr><p:presentation autoshow='TRUE'/></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:secPr><p:presentation showtime='4294967296'/></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:presentation/></p:secPr>" ++ suffix, .{ .max_items = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:presentation><c:fillBrush/></p:presentation></p:secPr>" ++ suffix, .{ .max_fill_brushes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:presentation><c:fillBrush/></p:presentation></p:secPr>" ++ suffix, .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:presentation><c:fillBrush><c:gradation/></c:fillBrush></p:presentation></p:secPr>" ++ suffix, .{ .max_brush_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:presentation soundIDRef='ab'/></p:secPr>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    var exact = try inspect(a, prefix ++ "<p:secPr><p:presentation soundIDRef='ab'><c:fillBrush/></p:presentation></p:secPr>" ++ suffix, .{ .max_items = 1, .max_fill_brushes = 1, .max_direct_children = 1, .max_attribute_bytes = 2 });
    exact.deinit(a);
    var exact_brush_child = try inspect(a, prefix ++ "<p:secPr><p:presentation><c:fillBrush><c:gradation/></c:fillBrush></p:presentation></p:secPr>" ++ suffix, .{ .max_brush_children = 1 });
    defer exact_brush_child.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), exact_brush_child.brush_children);
}

test "HWPX section presentation enforces part order and releases allocation failures" {
    const a = std.testing.allocator;
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, presentation.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ "<p:secPr><p:presentation/></p:secPr>" ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, presentation.inspect(a, &.{later}, .{}));
    const source = prefix ++ "<p:secPr><p:presentation effect='random' soundIDRef='x' invertText='1' autoshow='0' showtime='1' applyto='WholeDoc'><c:fillBrush/><c:fillBrush/></p:presentation></p:secPr>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source_xml: []const u8) !void {
            var report = try inspect(allocator, source_xml, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), report.fill_brushes.len);
        }
    }.run, .{source});
}
