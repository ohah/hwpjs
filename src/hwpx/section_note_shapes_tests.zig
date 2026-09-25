const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const notes = @import("section_note_shapes.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: notes.Options) !notes.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return notes.inspect(a, &.{tree}, options);
}

test "HWPX section note shapes preserve complete foot and end raw child fields" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++ "<p:secPr>" ++
        "<p:footNotePr><p:autoNumFormat type='USER_CHAR' userChar='*' prefixChar='' suffixChar=')' supscript='true'/>" ++
        "<p:noteLine length='-4' type='THICK_SLIM' width=' 0.12   mm ' color='#AABBcc'/>" ++
        "<p:noteSpacing betweenNotes='1' belowLine='2' aboveLine='3'/>" ++
        "<p:numbering type='ON_PAGE' newNum='4'/><p:placement place='RIGHT_MOST_COLUMN' beneathText='1'/></p:footNotePr>" ++
        "<p:endNotePr><p:autoNumFormat type='DIGIT' userChar='' prefixChar='문' suffixChar='）' supscript='0'/>" ++
        "<p:noteLine length='14692344' type='SOLID' width='4 mm' color='#A8808A1'/>" ++
        "<p:noteSpacing betweenNotes='0' belowLine='567' aboveLine='850'/>" ++
        "<p:numbering type='CONTINUOUS' newNum='1'/><p:placement place='EACH_COLUMN' beneathText='0'/></p:endNotePr>" ++
        "</p:secPr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    try std.testing.expectEqual(@as(usize, 10), report.children.len);
    try std.testing.expectEqual(@as(usize, 1), report.foot_notes);
    try std.testing.expectEqual(@as(usize, 1), report.end_notes);
    try std.testing.expectEqual(@as(usize, 2), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 1), report.noncanonical_colors);
    try std.testing.expectEqual(@as(usize, 5), report.notes[0].direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.notes[0].count(.note_line));
    try std.testing.expectEqualStrings("*", report.children[0].get(.user_char).?);
    try std.testing.expectEqualStrings(" 0.12   mm ", report.children[1].get(.line_width).?);
    try std.testing.expectEqualStrings("-4", report.children[1].get(.line_length).?);
    try std.testing.expectEqualStrings("ON_PAGE", report.children[3].get(.numbering_type).?);
    try std.testing.expectEqualStrings("문", report.children[5].get(.prefix_char).?);
    try std.testing.expectEqualStrings("#A8808A1", report.children[6].get(.line_color).?);
    try std.testing.expectEqualStrings("EACH_COLUMN", report.children[9].get(.placement_place).?);
    try std.testing.expectEqual(@as(usize, 1), report.children[9].note_index);
}

test "HWPX section note shapes require direct ancestry and retain duplicates and missing values" {
    const a = std.testing.allocator;
    var report = try inspect(a, prefix ++
        "<p:secPr xmlns:x='urn:other'><x:footNotePr/><p:wrapper><p:footNotePr/></p:wrapper>" ++
        "<p:footNotePr other='1'><x:noteLine/><p:wrapper><p:noteLine/></p:wrapper>" ++
        "<p:noteLine xmlns:y='urn:other' y:length='999' length='0' extra='2'><p:future/></p:noteLine>" ++
        "<p:noteLine/></p:footNotePr><p:footNotePr><p:numbering type='FUTURE'/></p:footNotePr>" ++
        "</p:secPr><p:endNotePr><p:noteLine length='9'/></p:endNotePr>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    try std.testing.expectEqual(@as(usize, 3), report.children.len);
    try std.testing.expectEqual(@as(usize, 2), report.notes[0].count(.note_line));
    try std.testing.expectEqual(@as(usize, 0), report.notes[1].count(.note_line));
    try std.testing.expectEqual(@as(usize, 1), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 3), report.other_attributes);
    try std.testing.expectEqualStrings("0", report.children[0].get(.line_length).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.children[1].get(.line_length));
    try std.testing.expectEqual(report.notes[0].parent_element_index, report.notes[1].parent_element_index);
    try std.testing.expect(report.notes[0].element_index < report.notes[1].element_index);
    try std.testing.expectEqual(@as(usize, 1), report.children[2].note_index);
}

test "HWPX section note shapes validate official scalar lexicals and exact budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidXmlSigned32, inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:noteLine length='2147483648'/></p:footNotePr></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:secPr><p:endNotePr><p:noteSpacing belowLine='4294967296'/></p:endNotePr></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidPositiveInteger, inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:numbering newNum='0'/></p:footNotePr></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, prefix ++ "<p:secPr><p:endNotePr><p:placement beneathText='TRUE'/></p:endNotePr></p:secPr>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:footNotePr/></p:secPr>" ++ suffix, .{ .max_notes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:noteLine/></p:footNotePr></p:secPr>" ++ suffix, .{ .max_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:noteLine/></p:footNotePr></p:secPr>" ++ suffix, .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:noteLine length='12'/></p:footNotePr></p:secPr>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    var exact = try inspect(a, prefix ++ "<p:secPr><p:footNotePr><p:noteLine length='12'/></p:footNotePr></p:secPr>" ++ suffix, .{ .max_notes = 1, .max_children = 1, .max_direct_children = 1, .max_attribute_bytes = 2 });
    exact.deinit(a);
}

test "HWPX section note shapes enforce part order and release every allocation failure" {
    const a = std.testing.allocator;
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, notes.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ "<p:secPr><p:footNotePr/></p:secPr>" ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, notes.inspect(a, &.{later}, .{}));
    const source = prefix ++ "<p:secPr><p:footNotePr><p:autoNumFormat type='USER_CHAR' userChar='*'/><p:noteLine length='-1' width='4 mm' color='#A10FCA0'/><p:numbering newNum='1'/></p:footNotePr><p:endNotePr><p:placement place='END_OF_SECTION'/></p:endNotePr></p:secPr>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, xml_source: []const u8) !void {
            var report = try inspect(allocator, xml_source, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), report.notes.len);
        }
    }.run, .{source});
}
