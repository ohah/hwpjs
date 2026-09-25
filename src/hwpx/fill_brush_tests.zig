const std = @import("std");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const brushes = @import("fill_brush.zig");

const header_prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>";
const section_prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>";

fn inspect(a: std.mem.Allocator, header_xml: []const u8, section_xml: []const u8, options: brushes.Options) !brushes.Report {
    var header = try header_tree.parse(a, header_xml, 0, .{});
    defer header.deinit(a);
    var section = try section_tree.parse(a, section_xml, 0, 1, .{});
    defer section.deinit(a);
    return brushes.inspect(a, &header, &.{section}, options);
}

test "HWPX fill brushes retain every official variant and leaf field" {
    const a = std.testing.allocator;
    var report = try inspect(a, header_prefix ++ "<h:borderFill><c:fillBrush>" ++
        "<c:winBrush faceColor='#AABBcc' hatchColor='none' hatchStyle='CROSS_DIAGONAL' alpha='.5'/>" ++
        "<c:gradation type='RADIAL' angle='-2' centerX='3' centerY='4' step='5' colorNum='2' stepCenter='6' alpha='1e-2'>" ++
        "<c:color value='#010203'/><c:color value='#FFFFFF'/></c:gradation>" ++
        "<c:imgBrush mode='ZOOM'><c:img binaryItemIDRef='image1' bright='-15' contrast='20' effect='GRAY_SCALE' alpha='0'/></c:imgBrush>" ++
        "</c:fillBrush></h:borderFill></h:head>", section_prefix ++ "</s:sec>", .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.brushes.len);
    try std.testing.expectEqual(@as(usize, 6), report.nodes.len);
    try std.testing.expectEqual(@as(usize, 1), report.count(.win_brush));
    try std.testing.expectEqual(@as(usize, 1), report.count(.gradation));
    try std.testing.expectEqual(@as(usize, 1), report.count(.img_brush));
    try std.testing.expectEqual(@as(usize, 2), report.count(.color));
    try std.testing.expectEqual(@as(usize, 1), report.count(.image));
    try std.testing.expectEqual(@as(usize, 1), report.non_six_hex_colors);
    try std.testing.expectEqual(@as(usize, 0), report.color_count_mismatch);
    try std.testing.expectEqualStrings("none", report.nodes[0].get(.hatch_color).?);
    try std.testing.expectEqualStrings("1e-2", report.nodes[1].get(.gradation_alpha).?);
    try std.testing.expectEqualStrings("#FFFFFF", report.nodes[3].get(.color_value).?);
    try std.testing.expectEqualStrings("image1", report.nodes[5].get(.binary_item_id_ref).?);
    try std.testing.expectEqualStrings("-15", report.nodes[5].get(.bright).?);
    try std.testing.expectEqual(@as(?usize, 1), report.nodes[3].parent_node_index);
    try std.testing.expectEqual(@as(?usize, 4), report.nodes[5].parent_node_index);
}

test "HWPX fill brushes preserve duplicates unknowns and exact ancestry" {
    const a = std.testing.allocator;
    var report = try inspect(a, header_prefix ++ "<h:borderFill xmlns:x='urn:foreign'><x:fillBrush/>" ++
        "<c:fillBrush other='1'><x:gradation/><c:gradation type='FUTURE' colorNum='3' extra='x'>" ++
        "<x:color/><c:wrapper><c:color value='#111111'/></c:wrapper><c:color value='none'/>" ++
        "<c:color value='#222222'/></c:gradation><c:gradation/></c:fillBrush>" ++
        "</h:borderFill></h:head>", section_prefix ++ "<p:rect><c:fillBrush><c:imgBrush mode='FUTURE'><c:img effect='FUTURE'/></c:imgBrush></c:fillBrush></p:rect></s:sec>", .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.brushes.len);
    try std.testing.expectEqual(@as(usize, 2), report.count(.gradation));
    try std.testing.expectEqual(@as(usize, 2), report.count(.color));
    try std.testing.expectEqual(@as(usize, 3), report.unknown_enums);
    try std.testing.expectEqual(@as(usize, 2), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.non_six_hex_colors);
    try std.testing.expectEqual(@as(usize, 1), report.color_count_mismatch);
    try std.testing.expectEqual(@as(usize, 2), report.brushes[0].count(.gradation));
    try std.testing.expectEqual(@as(usize, 0), report.brushes[1].count(.gradation));
    try std.testing.expect(report.brushes[0].part_kind == .header and report.brushes[1].part_kind == .section);
}

test "HWPX fill brushes reject invalid scalar spellings and enforce exact budgets" {
    const a = std.testing.allocator;
    const empty_section = section_prefix ++ "</s:sec>";
    try std.testing.expectError(error.InvalidXmlFloat, inspect(a, header_prefix ++ "<c:fillBrush><c:winBrush alpha='1_0'/></c:fillBrush></h:head>", empty_section, .{}));
    try std.testing.expectError(error.InvalidXmlSigned32, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation angle='2147483648'/></c:fillBrush></h:head>", empty_section, .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation colorNum='4294967296'/></c:fillBrush></h:head>", empty_section, .{}));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush/></h:head>", empty_section, .{ .max_brushes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation/></c:fillBrush></h:head>", empty_section, .{ .max_nodes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation><c:color value='#112233'/></c:gradation></c:fillBrush></h:head>", empty_section, .{ .max_nodes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation/></c:fillBrush></h:head>", empty_section, .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation type='LINEAR'><c:color value='#112233'/></c:gradation></c:fillBrush></h:head>", empty_section, .{ .max_direct_children = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:gradation><c:color value='#112233'><c:unknown/></c:color></c:gradation></c:fillBrush></h:head>", empty_section, .{ .max_direct_children = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, header_prefix ++ "<c:fillBrush><c:winBrush faceColor='#FFFFFF'/></c:fillBrush></h:head>", empty_section, .{ .max_attribute_bytes = 6 }));
    var exact = try inspect(a, header_prefix ++ "<c:fillBrush><c:gradation colorNum='1'><c:color value='#112233'/></c:gradation></c:fillBrush></h:head>", empty_section, .{ .max_brushes = 1, .max_nodes = 2, .max_direct_children = 2, .max_attribute_bytes = 7 });
    exact.deinit(a);
}

test "HWPX fill brushes reject wrong part order and release all allocation failures" {
    const a = std.testing.allocator;
    var section = try section_tree.parse(a, section_prefix ++ "</s:sec>", 0, 0, .{});
    defer section.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, brushes.inspect(a, &section, &.{}, .{}));
    var header = try header_tree.parse(a, header_prefix ++ "</h:head>", 0, .{});
    defer header.deinit(a);
    var later = try section_tree.parse(a, section_prefix ++ "</s:sec>", 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, brushes.inspect(a, &header, &.{later}, .{}));
    const header_xml = header_prefix ++ "<c:fillBrush><c:gradation type='LINEAR' colorNum='1' alpha='0'><c:color value='#123456'/></c:gradation><c:imgBrush mode='TOTAL'><c:img binaryItemIDRef='image2' bright='0' contrast='0' effect='REAL_PIC' alpha='0'/></c:imgBrush></c:fillBrush></h:head>";
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, xml_header: []const u8) !void {
            var report = try inspect(allocator, xml_header, section_prefix ++ "</s:sec>", .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), report.nodes.len);
        }
    }.run, .{header_xml});
}
