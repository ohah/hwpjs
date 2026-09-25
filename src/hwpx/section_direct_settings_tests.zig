const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const settings = @import("section_direct_settings.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, xml: []const u8, options: settings.Options) !settings.Report {
    var tree = try section_tree.parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    return settings.inspect(a, &.{tree}, options);
}

test "HWPX section direct settings retain each known and observed extension value" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++
        "<p:secPr>" ++
        "<p:startNum pageStartsOn=' ODD ' page='1' pic='2' tbl='3' equation='4'/>" ++
        "<p:grid lineGrid='&#43;5' charGrid='6' wonggojiFormat='true' strikeContinue='1'/>" ++
        "<p:visibility hideFirstHeader='1' hideFirstFooter='0' hideFirstMasterPage='1' border='SHOW_FIRST' fill='HIDE_FIRST' hideFirstPageNum='0' hideFirstEmptyLine='1' showLineNumber='0'/>" ++
        "<p:lineNumberShape restartType='7' countBy='8' distance='9' startNumber='10'/>" ++
        "</p:secPr><p:secPr><p:startNum pageStartsOn='FUTURE'/><p:startNum/></p:secPr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), report.items.len);
    try std.testing.expectEqual(@as(usize, 3), report.count(.start_num));
    try std.testing.expectEqual(@as(usize, 1), report.count(.grid));
    try std.testing.expectEqual(@as(usize, 1), report.count(.visibility));
    try std.testing.expectEqual(@as(usize, 1), report.count(.line_number_shape));
    try std.testing.expectEqualStrings(" ODD ", report.items[0].get(.page_starts_on).?);
    try std.testing.expectEqualStrings("1", report.items[0].get(.page).?);
    try std.testing.expectEqualStrings("1", report.items[1].get(.strike_continue).?);
    try std.testing.expectEqualStrings("+5", report.items[1].get(.line_grid).?);
    try std.testing.expectEqualStrings("true", report.items[1].get(.wonggoji_format).?);
    try std.testing.expectEqualStrings("SHOW_FIRST", report.items[2].get(.border).?);
    try std.testing.expectEqualStrings("10", report.items[3].get(.start_number).?);
    try std.testing.expectEqualStrings("FUTURE", report.items[4].get(.page_starts_on).?);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 1), report.extension_attributes);
    try std.testing.expectEqual(@as(?[]const u8, null), report.items[5].get(.page_starts_on));
    try std.testing.expectEqual(report.items[4].section_ordinal, report.items[5].section_ordinal);
    try std.testing.expect(report.items[4].element_index < report.items[5].element_index);
    try std.testing.expectEqual(report.items[4].parent_element_index, report.items[5].parent_element_index);
}

test "HWPX section direct settings select only direct 2011 children and preserve unknowns" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++
        "<p:secPr xmlns:x='urn:foreign'><x:grid lineGrid='99'/><p:wrapper><p:startNum page='99'/></p:wrapper>" ++
        "<p:grid xmlns:y='urn:other' y:lineGrid='99' extra='yes' lineGrid='1'><p:future/></p:grid>" ++
        "<p:visibility border='FUTURE' fill='SHOW_ALL'/></p:secPr>" ++
        "<p:grid lineGrid='77'/>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.items.len);
    try std.testing.expectEqual(@as(usize, 1), report.count(.grid));
    try std.testing.expectEqual(@as(usize, 0), report.count(.start_num));
    try std.testing.expectEqualStrings("1", report.items[0].get(.line_grid).?);
    try std.testing.expectEqual(@as(usize, 2), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_enums);
}

test "HWPX section direct settings reject invalid scalars and enforce exact budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:secPr><p:startNum page='4294967296'/></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, prefix ++ "<p:secPr><p:grid wonggojiFormat='TRUE'/></p:secPr>" ++ suffix, .{}));
    var observed = try inspect(a, prefix ++ "<p:secPr><p:grid strikeContinue='FUTURE'/></p:secPr>" ++ suffix, .{});
    defer observed.deinit(a);
    try std.testing.expectEqualStrings("FUTURE", observed.items[0].get(.strike_continue).?);
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:startNum page='12'/></p:secPr>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:startNum/></p:secPr>" ++ suffix, .{ .max_items = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:startNum/><p:grid/></p:secPr>" ++ suffix, .{ .max_items = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:grid><p:future/></p:grid></p:secPr>" ++ suffix, .{ .max_direct_children = 0 }));
    var exact = try inspect(a, prefix ++ "<p:secPr><p:grid lineGrid='12'><p:future/></p:grid></p:secPr>" ++ suffix, .{ .max_items = 1, .max_attribute_bytes = 2, .max_direct_children = 1 });
    exact.deinit(a);
}

test "HWPX section direct settings enforce part order and release every allocation failure" {
    const a = std.testing.allocator;
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, settings.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ "<p:secPr><p:grid/></p:secPr>" ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, settings.inspect(a, &.{later}, .{}));
    const source = prefix ++ "<p:secPr><p:startNum pageStartsOn='ODD' page='1'/><p:grid lineGrid='2' strikeContinue='0'/><p:visibility hideFirstHeader='1'/><p:lineNumberShape distance='4'/></p:secPr>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, xml: []const u8) !void {
            var report = try inspect(allocator, xml, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), report.items.len);
        }
    }.run, .{source});
}
