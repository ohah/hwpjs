const std = @import("std");
const section_tree = @import("section_tree.zig");
const equation = @import("equation.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: equation.Options) !equation.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return equation.inspect(a, &.{tree}, options);
}

test "HWPX equation shape owns all 25 geometry values and exact XML subspans" {
    const source = prefix ++ "<p:equation>" ++
        "<p:sz width=' +000 ' widthRelTo='ABSOLUTE' height='4294967295' heightRelTo='PAPER' protect='false'/>" ++
        "<p:pos treatAsChar='1' affectLSpacing='true' flowWithText='0' allowOverlap='false' holdAnchorAndSO='1' vertRelTo='PARA' horzRelTo='COLUMN' vertAlign='TOP' horzAlign='RIGHT' vertOffset='-2147483648' horzOffset='4294967295'/>" ++
        "<p:outMargin left='-1' right='0' top='+2' bottom='2147483648'/>" ++
        "<p:caption side='TOP' fullSz='true' width='-1' gap='850' lastWidth='0'><p:subList><p:p/></p:subList></p:caption>" ++
        "<p:script>x</p:script></p:equation>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    const expected = [_][]const []const u8{
        &.{ " +000 ", "ABSOLUTE", "4294967295", "PAPER", "false" },
        &.{ "1", "true", "0", "false", "1", "PARA", "COLUMN", "TOP", "RIGHT", "-2147483648", "4294967295" },
        &.{ "-1", "0", "+2", "2147483648" },
        &.{ "TOP", "true", "-1", "850", "0" },
    };
    try std.testing.expectEqual(@as(usize, 4), report.shape_children.len);
    try std.testing.expectEqual(@as(usize, 4), report.equations[0].shape_child_count);
    var value_bytes: usize = 0;
    for (report.shape_children, expected, 0..) |child, wanted, index| {
        try std.testing.expectEqual(index, @intFromEnum(child.kind));
        try std.testing.expectEqual(@as(usize, 0), child.equation_index);
        try std.testing.expectEqual(wanted.len, child.values.len);
        for (report.shape.by_kind[index].fields[0..wanted.len]) |counts| {
            try std.testing.expectEqual(@as(usize, 1), counts.present);
            try std.testing.expectEqual(@as(usize, 0), counts.absent);
        }
        for (child.values, wanted) |actual, value| {
            try std.testing.expectEqualStrings(value, actual.?);
            value_bytes += value.len;
        }
        const base = @intFromPtr(report.equations[0].raw_xml.ptr);
        const offset = @intFromPtr(child.raw_xml.ptr) - base;
        try std.testing.expect(offset + child.raw_xml.len <= report.equations[0].raw_xml.len);
        try std.testing.expect(std.mem.indexOf(u8, source, child.raw_xml) != null);
    }
    try std.testing.expectEqualStrings("<p:outMargin left='-1' right='0' top='+2' bottom='2147483648'/>", report.shape_children[2].raw_xml);
    try std.testing.expectEqualStrings(" +000 ", report.shape_children[0].get("width").?);
    try std.testing.expectEqual(@as(usize, 1), report.shape.direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[0].fields[0].zero);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[1].fields[9].negative);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[1].fields[10].highbit);
    try std.testing.expectEqual(report.equations[0].raw_xml.len + value_bytes + 1, report.owned_bytes);
}

test "HWPX equation shape retains duplicates metadata and missing versus empty values" {
    const source = prefix ++ "<p:equation><p:sz width='0' widthRelTo=''/><p:sz widthRelTo='F&amp;F'/>" ++
        "<p:shapeComment future='x'>text<![CDATA[<]]></p:shapeComment><p:parameterset><p:integer/></p:parameterset><p:metaTag/>" ++
        "<x:pos treatAsChar='invalid'/><p:label topmargin='invalid'/><p:future><p:pos treatAsChar='invalid'/></p:future>" ++
        "<p:pos x:treatAsChar='invalid'/></p:equation><p:equation/><p:sz width='invalid'/>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 6), report.shape_children.len);
    try std.testing.expectEqual(@as(usize, 9), report.other_children);
    try std.testing.expectEqual(@as(usize, 3), report.shape.unknown_children);
    try std.testing.expectEqual(@as(usize, 2), report.shape.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[0].duplicate_equations);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[0].missing_equations);
    try std.testing.expectEqual(@as(usize, 2), report.shape.by_kind[0].fields[1].unknown_enum);
    try std.testing.expectEqualStrings("", report.shape_children[0].get("widthRelTo").?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.shape_children[1].get("width"));
    try std.testing.expectEqualStrings("F&F", report.shape_children[1].get("widthRelTo").?);
    try std.testing.expectEqualStrings("<p:shapeComment future='x'>text<![CDATA[<]]></p:shapeComment>", report.shape_children[2].raw_xml);
    try std.testing.expectEqual(@as(usize, 0), report.shape_children[2].values.len);
    try std.testing.expectEqual(@as(usize, 1), report.shape_children[3].direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.shape.by_kind[1].fields[0].absent);
    try std.testing.expectEqual(@as(usize, 6), report.equations[1].first_shape_child);
    try std.testing.expectEqual(@as(usize, 0), report.equations[1].shape_child_count);
}

test "HWPX equation shape rejects malformed values even in later duplicates" {
    const a = std.testing.allocator;
    const cases = .{
        .{ "<p:sz width='0'/><p:sz width='4294967296'/>", error.InvalidUnsigned32 },
        .{ "<p:sz width=''/>", error.InvalidNonNegativeInteger },
        .{ "<p:sz height='-1'/>", error.InvalidNonNegativeInteger },
        .{ "<p:sz protect='TRUE'/>", error.InvalidXmlBoolean },
        .{ "<p:pos treatAsChar='2'/>", error.InvalidXmlBoolean },
        .{ "<p:pos vertOffset='-2147483649'/>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:outMargin bottom='4294967296'/>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:caption width='0' gap='bad'/>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:caption lastWidth='-1'/>", error.InvalidNonNegativeInteger },
    };
    inline for (cases) |case| try std.testing.expectError(case[1], inspect(a, prefix ++ "<p:equation>" ++ case[0] ++ "</p:equation>" ++ suffix, .{}));
}

test "HWPX equation shape enforces exact cumulative copies and child limits" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:equation><p:sz widthRelTo='AB'/><p:outMargin left='-1'/></p:equation>" ++ suffix;
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_other_children = 1 }));
    var exact = try inspect(a, source, .{ .max_attribute_bytes = 2, .max_owned_bytes = owned, .max_other_children = 2 });
    exact.deinit();
}

test "HWPX equation shape retains source order across sections and equations" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<p:equation><p:pos/><p:sz width='1'/></p:equation><p:equation><p:outMargin/></p:equation>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:equation><p:sz width='2'/><p:pos/></p:equation>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try equation.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 5), report.shape_children.len);
    const owners = [_]usize{ 0, 0, 1, 2, 2 };
    for (report.shape_children, owners) |child, owner| try std.testing.expectEqual(owner, child.equation_index);
    try std.testing.expectEqual(@as(usize, 3), report.equations[2].first_shape_child);
    try std.testing.expectEqual(@as(usize, 1), report.equations[2].section_ordinal);
    try std.testing.expectEqualStrings("pos", report.shape_children[0].localName());
    try std.testing.expectEqualStrings("2", report.shape_children[3].get("width").?);
}

test "HWPX equation shape preserves UTF16 subspans and decoded attribute bytes" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns='http://www.hancom.co.kr/hwpml/2011/paragraph'><p><run><equation><sz widthRelTo='&#xAC00;' width='&#49;'/></equation></run></p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        const child = report.shape_children[0];
        const offset = 2 + std.mem.indexOf(u8, ascii, "<sz").? * 2;
        try std.testing.expectEqualStrings(raw[offset..][0 .. "<sz widthRelTo='&#xAC00;' width='&#49;'/>".len * 2], child.raw_xml);
        try std.testing.expectEqualStrings("가", child.get("widthRelTo").?);
        try std.testing.expectEqualStrings("1", child.get("width").?);
        try std.testing.expectEqual(report.equations[0].raw_xml.len + 4, report.owned_bytes);
    }
}

test "HWPX equation shape frees all allocations including failure after populated geometry" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:equation><p:sz width='1' widthRelTo='PAGE'/><p:pos vertOffset='-1'/><p:caption side='TOP'><p:subList/></p:caption><p:script>x</p:script></p:equation>" ++ suffix, .{});
            defer report.deinit();
            try std.testing.expectEqualStrings("1", report.shape_children[0].get("width").?);
        }
    }.run, .{});
}
