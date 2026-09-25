const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const borders = @import("section_page_border.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: borders.Options) !borders.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return borders.inspect(a, &.{tree}, options);
}

test "HWPX section page borders preserve three page variants and each offset" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++ "<p:secPr>" ++
        "<p:pageBorderFill type='BOTH' borderFillIDRef='1' textBorder='PAPER' headerInside='0' footerInside='1' fillArea='PAPER'><p:offset left='1417' right='1417' top='1417' bottom='1417'/></p:pageBorderFill>" ++
        "<p:pageBorderFill type='EVEN' borderFillIDRef='0' textBorder='CONTENT' headerInside='true' fillArea='PAGE'><p:offset left='0'/></p:pageBorderFill>" ++
        "<p:pageBorderFill type='ODD' fillArea='BORDER'><p:offset/><p:offset bottom='2'/></p:pageBorderFill>" ++
        "</p:secPr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.borders);
    try std.testing.expectEqual(@as(usize, 4), report.offsets);
    try std.testing.expectEqual(@as(usize, 7), report.items.len);
    try std.testing.expectEqualStrings("BOTH", report.items[0].get(.page_type).?);
    try std.testing.expectEqualStrings("1417", report.items[1].get(.left).?);
    try std.testing.expectEqual(report.items[0].element_index, report.items[1].parent_element_index);
    try std.testing.expectEqualStrings("EVEN", report.items[2].get(.page_type).?);
    try std.testing.expectEqualStrings("true", report.items[2].get(.header_inside).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.items[3].get(.right));
    try std.testing.expectEqualStrings("BORDER", report.items[4].get(.fill_area).?);
    try std.testing.expectEqual(@as(usize, 2), report.items[4].direct_children);
    try std.testing.expectEqualStrings("2", report.items[6].get(.bottom).?);
}

test "HWPX section page borders ignore spoofed ancestry and preserve unknowns" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++
        "<p:secPr xmlns:x='urn:foreign'><x:pageBorderFill/><p:wrapper><p:pageBorderFill type='BOTH'/></p:wrapper>" ++
        "<p:pageBorderFill xmlns:y='urn:other' type='FUTURE' y:type='ODD' other='1'><x:offset/><p:wrapper><p:offset/></p:wrapper><p:offset extra='x' left='1'><p:future/></p:offset></p:pageBorderFill>" ++
        "</p:secPr><p:pageBorderFill type='ODD'><p:offset/></p:pageBorderFill>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.borders);
    try std.testing.expectEqual(@as(usize, 1), report.offsets);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 3), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 4), report.direct_children);
    try std.testing.expectEqualStrings("FUTURE", report.items[0].get(.page_type).?);
    try std.testing.expectEqualStrings("1", report.items[1].get(.left).?);
}

test "HWPX section page borders reject scalar errors and enforce exact limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill borderFillIDRef='4294967296'/></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill><p:offset left='-1'/></p:pageBorderFill></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill headerInside='TRUE'/></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill/></p:secPr>" ++ suffix, .{ .max_items = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill><p:offset/></p:pageBorderFill></p:secPr>" ++ suffix, .{ .max_items = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill><p:offset/></p:pageBorderFill></p:secPr>" ++ suffix, .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:pageBorderFill borderFillIDRef='12'/></p:secPr>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    var exact = try inspect(a, prefix ++ "<p:secPr><p:pageBorderFill borderFillIDRef='12'><p:offset left='1'/></p:pageBorderFill></p:secPr>" ++ suffix, .{ .max_items = 2, .max_direct_children = 1, .max_attribute_bytes = 2 });
    exact.deinit(a);
}

test "HWPX section page borders enforce part order and release every allocation failure" {
    const a = std.testing.allocator;
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, borders.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ "<p:secPr><p:pageBorderFill/></p:secPr>" ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, borders.inspect(a, &.{later}, .{}));
    const source = prefix ++ "<p:secPr><p:pageBorderFill type='BOTH' borderFillIDRef='1' headerInside='false'><p:offset left='1417' right='0'/></p:pageBorderFill></p:secPr>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, xml_source: []const u8) !void {
            var report = try inspect(allocator, xml_source, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), report.items.len);
        }
    }.run, .{source});
}
