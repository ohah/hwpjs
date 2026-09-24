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

test "HWPX table cell fields preserve negative and high-bit margin lexical values" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc hasMargin='false'>" ++
        "<p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/>" ++
        "<p:cellSz width='&#49;0' height='0'/>" ++
        "<p:cellMargin left='-21280' right='4294948081' top='0' bottom='141'/>" ++
        "</p:tc></p:tr></p:tbl>", .{});
    const fields = report.cell_fields;
    try std.testing.expectEqual(@as(usize, 1), fields.cells);
    try std.testing.expectEqual(@as(usize, 1), fields.size_elements);
    try std.testing.expectEqual(@as(usize, 1), fields.margin_elements);
    try std.testing.expectEqualSlices(u64, &.{ 10, 0 }, &fields.size_sum);
    try std.testing.expectEqualSlices(i64, &.{ -21280, 4294948081, 0, 141 }, &fields.margin_sum);
    try std.testing.expectEqualSlices(usize, &.{ 1, 0, 0, 0 }, &fields.negative_margin_field);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 0, 0 }, &fields.highbit_margin_field);
    try std.testing.expectEqual(@as(usize, 1), fields.zero_size_field[1]);
    try std.testing.expectEqual(@as(usize, 1), fields.has_margin.false_value);
    try std.testing.expectEqual(@as(usize, 1), fields.false_with_margin);
}

test "HWPX table cell fields keep absent duplicate and prefixed values separate" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='3'><p:tr>" ++
        "<p:tc hasMargin='true'><p:cellSz x:width='1' height='2'/></p:tc>" ++
        "<p:tc hasMargin='false'><p:cellSz width='1'/><p:cellSz width='2'/><p:cellMargin left='1'/><p:cellMargin right='2'/></p:tc>" ++
        "<p:tc><x:cellSz width='3'/><x:cellMargin left='4'/></p:tc>" ++
        "</p:tr></p:tbl>", .{});
    const fields = report.cell_fields;
    try std.testing.expectEqual(@as(usize, 3), fields.cells);
    try std.testing.expectEqual(@as(usize, 1), fields.size_elements);
    try std.testing.expectEqual(@as(usize, 1), fields.missing_size);
    try std.testing.expectEqual(@as(usize, 1), fields.duplicate_size);
    try std.testing.expectEqual(@as(usize, 1), fields.missing_size_field[0]);
    try std.testing.expectEqual(@as(usize, 2), fields.missing_margin);
    try std.testing.expectEqual(@as(usize, 1), fields.duplicate_margin);
    try std.testing.expectEqual(@as(usize, 1), fields.has_margin.true_value);
    try std.testing.expectEqual(@as(usize, 1), fields.has_margin.false_value);
    try std.testing.expectEqual(@as(usize, 1), fields.has_margin.absent);
    try std.testing.expectEqual(@as(usize, 1), fields.true_without_margin);
    try std.testing.expectEqual(@as(usize, 1), fields.false_with_margin);
}

test "HWPX table cell fields report partial margins without filling defaults" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc hasMargin='0'><p:cellSz width='1' height='2'/><p:cellMargin left='3' top='0'/></p:tc></p:tr></p:tbl>", .{});
    const fields = report.cell_fields;
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 0, 1 }, &fields.missing_margin_field);
    try std.testing.expectEqualSlices(usize, &.{ 0, 0, 1, 0 }, &fields.zero_margin_field);
    try std.testing.expectEqualSlices(i64, &.{ 3, 0, 0, 0 }, &fields.margin_sum);
    try std.testing.expectEqual(@as(usize, 1), fields.false_with_margin);
}

test "HWPX table cell fields validate surviving elements and lexical limits" {
    const a = std.testing.allocator;
    const start = "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc>";
    const end = "</p:tc></p:tr></p:tbl>";
    const cases = [_]struct { child: []const u8, err: anyerror }{
        .{ .child = "<p:cellSz width='-1' height='1'/>", .err = error.InvalidNonNegativeInteger },
        .{ .child = "<p:cellSz width='4294967296' height='1'/>", .err = error.InvalidUnsigned32 },
        .{ .child = "<p:cellMargin left='-2147483649' right='1' top='1' bottom='1'/>", .err = error.InvalidSignedOrUnsigned32 },
        .{ .child = "<p:cellMargin left='4294967296' right='1' top='1' bottom='1'/>", .err = error.InvalidSignedOrUnsigned32 },
    };
    for (cases) |case| {
        const body = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ start, case.child, end });
        defer a.free(body);
        try std.testing.expectError(case.err, inspectXml(a, body, .{}));
    }
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc hasMargin='TRUE'/></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellSz width='1' height='1'/></p:tc></p:tr></p:tbl>", .{ .max_attribute_bytes = 0 }));
}

test "HWPX table cell fields release all allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc name='A&amp;B' header='true' hasMargin='1' protect='false' editable='1' dirty='0' borderFillIDRef='7'><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='10' height='20'/><p:cellMargin left='-3' right='4294967295' top='0' bottom='1'/></p:tc></p:tr></p:tbl>", .{});
            try std.testing.expectEqual(@as(usize, 1), report.cell_fields.cells);
            try std.testing.expectEqual(@as(u64, 7), report.cell_fields.border_fill_sum);
        }
    }.run, .{});
}

test "HWPX table cell attributes preserve name flags and border reference lexical values" {
    const report = try inspectXml(std.testing.allocator, "<p:tbl rowCnt='1' colCnt='2'><p:tr>" ++
        "<p:tc name='A&amp;B' header='1' hasMargin='0' protect='true' editable='false' dirty='1' borderFillIDRef='4294967295'/>" ++
        "<p:tc x:name='ignored' x:header='true' x:borderFillIDRef='2' name='' header='false' borderFillIDRef='0'/>" ++
        "</p:tr></p:tbl>", .{});
    const fields = report.cell_fields;
    try std.testing.expectEqual(@as(usize, 2), fields.name_present);
    try std.testing.expectEqual(@as(usize, 1), fields.name_empty);
    try std.testing.expectEqual(@as(u64, 3), fields.name_utf8_bytes);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[0].true_value);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[0].false_value);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[1].true_value);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[1].absent);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[2].false_value);
    try std.testing.expectEqual(@as(usize, 1), fields.flags[3].true_value);
    try std.testing.expectEqual(@as(usize, 2), fields.border_fill_present);
    try std.testing.expectEqual(@as(usize, 1), fields.border_fill_zero);
    try std.testing.expectEqual(@as(u64, 4294967295), fields.border_fill_sum);
}

test "HWPX table cell attributes reject bad known lexical values and enforce byte limit" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc protect='TRUE'/></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc borderFillIDRef='4294967296'/></p:tr></p:tbl>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc name='long'/></p:tr></p:tbl>", .{ .max_attribute_bytes = 3 }));
    const absent = try inspectXml(a, "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc x:name='foreign' x:protect='wrong' x:borderFillIDRef='wrong'/></p:tr></p:tbl>", .{});
    try std.testing.expectEqual(@as(usize, 1), absent.cell_fields.name_absent);
    try std.testing.expectEqual(@as(usize, 1), absent.cell_fields.flags[1].absent);
    try std.testing.expectEqual(@as(usize, 1), absent.cell_fields.border_fill_absent);
}
