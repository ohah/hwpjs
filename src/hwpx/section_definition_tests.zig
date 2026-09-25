const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const section_definitions = @import("section_definition.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn read(a: std.mem.Allocator, xml: []const u8, options: section_definitions.Options) !section_definitions.Report {
    var section = try section_tree.parse(a, xml, 0, 0, .{});
    defer section.deinit(a);
    return section_definitions.inspect(a, &.{section}, options);
}

test "HWPX section definition preserves old and new tab fields independently" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++
        "<p:p><p:run><p:secPr id='' textDirection='HORIZONTAL' spaceColumns='1134' tabStop='8000' outlineShapeIDRef='1' memoShapeIDRef='0' textVerticalWidthHead='0' masterPageCnt='0'><p:grid/><p:pagePr/><p:pageBorderFill/></p:secPr></p:run></p:p>" ++
        "<p:p><p:run><p:secPr textDirection=' VERTICALALL ' spaceColumns='-2' tabStopVal='&#43;4000' tabStopUnit='CHAR'><p:pagePr/><p:pageBorderFill/></p:secPr></p:run></p:p>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.definitions.len);
    try std.testing.expectEqualStrings("", report.definitions[0].get(.id).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.definitions[1].get(.id));
    try std.testing.expectEqualStrings("8000", report.definitions[0].get(.tab_stop).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.definitions[0].get(.tab_stop_val));
    try std.testing.expectEqual(@as(?[]const u8, null), report.definitions[0].get(.tab_stop_unit));
    try std.testing.expectEqualStrings("+4000", report.definitions[1].get(.tab_stop_val).?);
    try std.testing.expectEqualStrings("-2", report.definitions[1].get(.space_columns).?);
    try std.testing.expectEqual(@as(usize, 2), report.definitions[0].childCount(.page_border_fill) + report.definitions[1].childCount(.page_border_fill));
    try std.testing.expectEqual(@as(usize, 0), report.unknown_enums);
}

test "HWPX section definition keeps extension values and classifies direct children" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++ "<p:secPr xmlns:x='urn:x' x:tabStop='99' textDirection='FUTURE' tabStopUnit='FUTURE' masterPageCnt='2' future='yes'><p:pagePr/><p:footer/><x:pagePr/><p:other><p:grid/></p:other></p:secPr><p:secPr/>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.definitions.len);
    try std.testing.expectEqual(@as(usize, 2), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 2), report.definitions[0].unknown_enums);
    try std.testing.expectEqualStrings("FUTURE", report.definitions[0].get(.text_direction).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.definitions[0].get(.tab_stop));
    try std.testing.expectEqualStrings("2", report.definitions[0].get(.master_page_count).?);
    try std.testing.expectEqual(@as(usize, 2), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.definitions[0].childCount(.page_pr));
    try std.testing.expectEqual(@as(usize, 0), report.definitions[0].childCount(.grid));
    try std.testing.expectEqual(@as(usize, 2), report.other_paragraph_children);
    try std.testing.expectEqual(@as(usize, 1), report.foreign_children);
    try std.testing.expectEqual(@as(usize, 4), report.direct_children);
}

test "HWPX section definition rejects malformed scalars and exact limits" {
    const a = std.testing.allocator;
    const begin = prefix ++ "<p:secPr ";
    const end = "/>" ++ suffix;
    try std.testing.expectError(error.InvalidXmlSigned32, read(a, begin ++ "tabStop='2147483648'" ++ end, .{}));
    try std.testing.expectError(error.InvalidXmlSigned32, read(a, begin ++ "spaceColumns='1_0'" ++ end, .{}));
    try std.testing.expectError(error.InvalidUnsigned32, read(a, begin ++ "outlineShapeIDRef='4294967296'" ++ end, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, read(a, begin ++ "textVerticalWidthHead='TRUE'" ++ end, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, read(a, begin ++ "masterPageCnt='-1'" ++ end, .{}));
    try std.testing.expectError(error.LimitExceeded, read(a, begin ++ "tabStop='12'" ++ end, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, read(a, begin ++ "tabStop='12'" ++ end, .{ .max_definitions = 0 }));
    var exact = try read(a, begin ++ "tabStop='12'" ++ end, .{ .max_attribute_bytes = 2, .max_definitions = 1 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, read(a, prefix ++ "<p:secPr><p:grid/></p:secPr>" ++ suffix, .{ .max_direct_children = 0 }));
    const two_children = prefix ++ "<p:secPr><p:grid/><p:pagePr/></p:secPr>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, read(a, two_children, .{ .max_direct_children = 1 }));
    var exact_children = try read(a, two_children, .{ .max_direct_children = 2 });
    exact_children.deinit(a);
    try std.testing.expectError(error.LimitExceeded, read(a, prefix ++ "<p:secPr/><p:secPr/>" ++ suffix, .{ .max_definitions = 1 }));
}

test "HWPX section definition validates section order and all allocation failures" {
    const a = std.testing.allocator;
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, section_definitions.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ "<p:secPr/>" ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, section_definitions.inspect(a, &.{later}, .{}));
    const source = prefix ++ "<p:secPr id='A&amp;B' tabStop='-2' textDirection='VERTICAL' masterPageCnt='1'><p:grid/><p:pagePr/></p:secPr><p:secPr id='C' tabStopVal='4' tabStopUnit='CHAR'/>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var report = try read(allocator, bytes, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqualStrings("A&B", report.definitions[0].get(.id).?);
            try std.testing.expectEqual(@as(usize, 2), report.definitions.len);
        }
    }.run, .{source});
}
