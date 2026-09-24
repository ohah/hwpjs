const std = @import("std");
const section_tree = @import("section_tree.zig");
const geometry = @import("table_geometry.zig");
const para_list = @import("para_list_attributes.zig");
const part_attributes = @import("xml_part_attributes.zig");
const xml = @import("../xml/root.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: geometry.Options) !geometry.Report {
    const source = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return geometry.inspect(a, &.{tree}, options);
}

test "HWPX cell subLists select direct children and reuse ParaListType field rules" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='2'><p:tr>" ++
        "<p:tc><p:subList id='' textDirection='FUTURE' lineWrap='KEEP' textWidth='&#49;2' hasTextRef='true' x:id='ignored' future='x'>" ++
        "<p:p id='0'/><p:future><p:p id='1'/></p:future></p:subList></p:tc>" ++
        "<p:tc><x:subList textWidth='bad'/><p:future><p:subList textWidth='bad'/></p:future></p:tc>" ++
        "</p:tr></p:tbl>", .{});
    const lists = report.cell_sub_lists;
    try std.testing.expectEqual(@as(usize, 2), lists.cells);
    try std.testing.expectEqual(@as(usize, 1), lists.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), lists.missing_cells);
    try std.testing.expectEqual(@as(usize, 1), lists.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 1), lists.other_direct_elements);
    try std.testing.expectEqual(@as(usize, 1), lists.unknown_enums);
    try std.testing.expectEqual(@as(usize, 2), lists.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), lists.field_present[@intFromEnum(para_list.Field.id)]);
    try std.testing.expectEqual(@as(usize, 1), lists.field_empty[@intFromEnum(para_list.Field.id)]);
    try std.testing.expectEqual(@as(u64, 12), lists.text_width_sum);
    try std.testing.expectEqual(@as(usize, 1), lists.has_text_ref_true);
}

test "HWPX cell subLists retain duplicate and empty observations" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='2'><p:tr>" ++
        "<p:tc><p:subList>literal text</p:subList><p:subList><p:p/><p:p/></p:subList></p:tc><p:tc/>" ++
        "</p:tr></p:tbl>", .{});
    const lists = report.cell_sub_lists;
    try std.testing.expectEqual(@as(usize, 2), lists.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), lists.duplicate_cells);
    try std.testing.expectEqual(@as(usize, 1), lists.missing_cells);
    try std.testing.expectEqual(@as(usize, 1), lists.empty_sub_lists);
    try std.testing.expectEqual(@as(usize, 2), lists.direct_paragraphs);
}

test "HWPX cell subLists reject malformed direct fields and enforce exact limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList textWidth='4294967296'/></p:tc></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList hasNumRef='TRUE'/></p:tc></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList id='long'/></p:tc></p:tr></p:tbl>", .{ .max_attribute_bytes = 3 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList/><p:subList/></p:tc></p:tr></p:tbl>", .{ .cell_sub_lists = .{ .max_sub_lists = 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList><p:p/><p:p/></p:subList></p:tc></p:tr></p:tbl>", .{ .cell_sub_lists = .{ .max_direct_paragraphs = 1 } }));
}

test "HWPX ParaListType tree reader rejects wrong and out-of-range elements" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:subList/></s:sec>";
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidParaListElement, para_list.readTree(a, &tree, 0, 4096));
    try std.testing.expectError(error.InvalidElementIndex, para_list.readTree(a, &tree, tree.elements.len, 4096));
}

test "HWPX ParaListType tree reader agrees with streaming reader on the same tag" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:subList id='' textDirection='FUTURE' lineWrap='KEEP' textWidth='&#49;2' hasTextRef='true' x:future='x' unknown='y'/></s:sec>";
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var root_tag = try part_attributes.parseStartTag(a, &tree, 0);
    defer root_tag.deinit(a);
    var list_tag = try part_attributes.parseStartTag(a, &tree, 1);
    defer list_tag.deinit(a);
    var scope: xml.namespaces.State = .{};
    defer scope.deinit(a);
    _ = try scope.enter(a, root_tag, .{});
    _ = try scope.enter(a, list_tag, .{});
    var streamed = try para_list.read(a, list_tag, &scope, 4096);
    defer streamed.deinit(a);
    var indexed = try para_list.readTree(a, &tree, 1, 4096);
    defer indexed.deinit(a);
    for (streamed.raw, indexed.raw) |left, right| {
        try std.testing.expectEqual(left == null, right == null);
        if (left) |value| try std.testing.expectEqualStrings(value, right.?);
    }
    try std.testing.expectEqual(streamed.unknown_enums, indexed.unknown_enums);
    try std.testing.expectEqual(streamed.other_attributes, indexed.other_attributes);
}

test "HWPX cell subLists release owned values under every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl><p:tr><p:tc><p:subList id='A&amp;B' textDirection='VERTICAL' lineWrap='BREAK' vertAlign='TOP' textWidth='12' textHeight='34' hasTextRef='1' hasNumRef='0'><p:p/></p:subList></p:tc></p:tr></p:tbl>", .{});
            try std.testing.expectEqual(@as(u64, 34), report.cell_sub_lists.text_height_sum);
        }
    }.run, .{});
}
