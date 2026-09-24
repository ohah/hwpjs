const std = @import("std");
const section_tree = @import("section_tree.zig");
const geometry = @import("table_geometry.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: geometry.Options) !geometry.Report {
    const source = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return geometry.inspect(a, &.{tree}, options);
}

test "HWPX table shape reads inherited scalars and direct children without defaults" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl id='4294967295' zOrder='-1' numberingType='TABLE' textWrap='THROUGH' textFlow='BOTH_SIDES' lock='1' dropcapstyle='None' rowCnt='0' colCnt='0'>" ++
        "<p:sz width='10' widthRelTo='ABSOLUTE' height='0' heightRelTo='PAGE' protect='true'/>" ++
        "<p:pos treatAsChar='false' affectLSpacing='1' flowWithText='true' allowOverlap='0' holdAnchorAndSO='1' vertRelTo='PARA' horzRelTo='COLUMN' vertAlign='TOP' horzAlign='LEFT' vertOffset='-2' horzOffset='4294967295'/>" ++
        "<p:outMargin left='-3' right='4294967295' top='0' bottom='4'/>" ++
        "<p:caption side='BOTTOM' fullSz='false' width='-1' gap='850' lastWidth='7'><p:subList textDirection='HORIZONTAL' textWidth='12'><p:p/></p:subList></p:caption>" ++
        "<p:label topmargin='1' leftmargin='2' boxwidth='3' boxlength='4' boxmarginhor='5' boxmarginver='6' labelcols='7' labelrows='8' landscape='WIDELY' pagewidth='9' pageheight='10'/>" ++
        "<p:shapeComment>comment</p:shapeComment><p:parameterset/><p:metaTag/><p:tr/></p:tbl>", .{});
    const shape = report.table_shape;
    try std.testing.expectEqual(@as(usize, 1), shape.tables);
    try std.testing.expectEqual(@as(usize, 8), shape.shape_children);
    try std.testing.expectEqual(@as(i64, 4294967295), shape.table_fields[0].sum);
    try std.testing.expectEqual(@as(i64, -1), shape.table_fields[1].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.table_fields[3].extension_enum);
    try std.testing.expectEqual(@as(usize, 1), shape.table_fields[5].true_value);
    try std.testing.expectEqual(@as(usize, 1), shape.size.elements);
    try std.testing.expectEqual(@as(i64, 10), shape.size.fields[0].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.size.fields[2].zero);
    try std.testing.expectEqual(@as(usize, 1), shape.size.fields[4].true_value);
    try std.testing.expectEqual(@as(i64, -2), shape.position.fields[9].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.position.fields[9].negative);
    try std.testing.expectEqual(@as(i64, 4294967295), shape.position.fields[10].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.position.fields[10].highbit);
    try std.testing.expectEqual(@as(i64, -3), shape.out_margin.fields[0].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.out_margin.fields[1].highbit);
    try std.testing.expectEqual(@as(usize, 1), shape.caption.elements);
    try std.testing.expectEqual(@as(i64, -1), shape.caption.fields[2].sum);
    try std.testing.expectEqual(@as(usize, 1), shape.caption_sub_lists);
    try std.testing.expectEqual(@as(usize, 1), shape.caption_direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 1), shape.label.elements);
    try std.testing.expectEqual(@as(i64, 10), shape.label.fields[10].sum);
    try std.testing.expectEqual(@as(usize, 0), shape.other_direct_children);
}

test "HWPX table shape preserves missing duplicate foreign and unknown values" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl x:id='9' x:textWrap='SQUARE' textWrap='FUTURE' rowCnt='0' colCnt='0'>" ++
        "<x:sz width='99'/><p:sz x:width='99' widthRelTo='FUTURE'/><p:sz width='1'/>" ++
        "<p:caption side='FUTURE'><p:subList textDirection='FUTURE'><p:p/><x:p/></p:subList><p:subList/><x:subList/></p:caption>" ++
        "<p:caption/><x:caption/><p:other><p:sz width='100'/></p:other><p:tr/></p:tbl><p:tbl rowCnt='0' colCnt='0'/>", .{});
    const shape = report.table_shape;
    try std.testing.expectEqual(@as(usize, 2), shape.tables);
    try std.testing.expectEqual(@as(usize, 2), shape.size.elements);
    try std.testing.expectEqual(@as(usize, 1), shape.size.missing_tables);
    try std.testing.expectEqual(@as(usize, 1), shape.size.duplicate_tables);
    try std.testing.expectEqual(@as(usize, 1), shape.size.fields[0].present);
    try std.testing.expectEqual(@as(usize, 1), shape.size.fields[1].unknown_enum);
    try std.testing.expectEqual(@as(usize, 1), shape.table_fields[3].unknown_enum);
    try std.testing.expectEqual(@as(usize, 1), shape.table_fields[3].absent);
    try std.testing.expectEqual(@as(usize, 2), shape.table_fields[0].absent);
    try std.testing.expectEqual(@as(usize, 2), shape.caption.elements);
    try std.testing.expectEqual(@as(usize, 1), shape.caption.duplicate_tables);
    try std.testing.expectEqual(@as(usize, 1), shape.caption.missing_tables);
    try std.testing.expectEqual(@as(usize, 2), shape.label.missing_tables);
    try std.testing.expectEqual(@as(usize, 1), shape.caption.fields[0].unknown_enum);
    try std.testing.expectEqual(@as(usize, 2), shape.caption_sub_lists);
    try std.testing.expectEqual(@as(usize, 1), shape.caption_duplicate_sub_list);
    try std.testing.expectEqual(@as(usize, 1), shape.caption_unknown_enums);
    try std.testing.expectEqual(@as(usize, 1), shape.caption_direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 2), shape.caption_other_direct_children);
    try std.testing.expectEqual(@as(usize, 3), shape.other_direct_children);
}

test "HWPX table shape checks surviving values limits and lexical bounds" {
    const a = std.testing.allocator;
    const tight = try inspectXml(a, "<p:tbl rowCnt='0' colCnt='0' textWrap='TIGHT'/>", .{});
    try std.testing.expectEqual(@as(usize, 1), tight.table_shape.table_fields[3].extension_enum);
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl id='4294967296'/>", .{}));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:tbl zOrder='-2147483649'/>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl lock='TRUE'/>", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl><p:sz width='4294967296'/></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:tbl><p:pos vertOffset='-2147483649'/></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:tbl><p:outMargin left='1'/><p:outMargin right='4294967296'/></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl><p:caption/><p:caption fullSz='TRUE'/></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl><p:label pageheight='4294967296'/></p:tbl>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl textWrap='THROUGH'/>", .{ .max_attribute_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:sz/></p:tbl>", .{ .table_shape = .{ .max_shape_children = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:caption><p:subList/></p:caption></p:tbl>", .{ .table_shape = .{ .max_caption_sub_lists = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:caption><p:subList><p:p/></p:subList></p:caption></p:tbl>", .{ .table_shape = .{ .max_caption_direct_paragraphs = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:sz/></p:tbl><p:tbl><p:sz/></p:tbl>", .{ .table_shape = .{ .max_shape_children = 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl><p:caption><p:subList/></p:caption></p:tbl><p:tbl><p:caption><p:subList/></p:caption></p:tbl>", .{ .table_shape = .{ .max_caption_sub_lists = 1 } }));
}

test "HWPX table shape releases all allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl id='7' textWrap='THROUGH'><p:sz width='10' protect='true'/><p:pos vertOffset='-2'/><p:outMargin left='4294967295'/><p:caption side='TOP'><p:subList textDirection='HORIZONTAL'><p:p/></p:subList></p:caption></p:tbl>", .{});
            try std.testing.expectEqual(@as(usize, 1), report.table_shape.table_fields[3].extension_enum);
            try std.testing.expectEqual(@as(usize, 1), report.table_shape.caption_sub_lists);
        }
    }.run, .{});
}
