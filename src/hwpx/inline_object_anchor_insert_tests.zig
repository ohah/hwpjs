//! Authored position/retention source tests. Native execution remains separate.
const std = @import("std");
const shared = @import("inline_object_insert.zig");
const trees = @import("xml_part_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const open_cell = "<p:p><p:run><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc protect='0'><p:subList><p:p>";
const close_cell = "<p:linesegarray/></p:p></p:subList><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>";
const tab = "<p:tab width='123' leader='4'/>";
const line = "<p:lineBreak/>";
const picture = "<p:pic id='9'><x:opaque xmlns:x='urn:retained' token='keep'/></p:pic>";
const object = "<p:equation id='10'/>";

fn projected(a: std.mem.Allocator, source: []const u8) ![]u8 {
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true };
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    return @import("anchor_paragraph_edit.zig").text(a, &tree, &sites, locations, 2, 64000);
}

fn insertAt(a: std.mem.Allocator, host: []const u8, witness: []const u8, unit: u32) ![]u8 {
    const input = try std.fmt.allocPrint(a, "{s}{s}{s}{s}", .{ prefix, open_cell, host, close_cell });
    defer a.free(input);
    var tree = try trees.parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    const target: shared.Target = .{ .section = 0, .paragraph = 2, .unit = unit, .expected_text = witness, .anchor_insertion = true };
    var counters: @import("section_text.zig").Report = .{};
    const binding = (try shared.bind(a, &tree, target, &counters)).?;
    const result = try shared.writeBound(a, &tree, binding, target, object, 64000);
    errdefer a.free(result);
    try std.testing.expectEqualStrings(input, tree.source);
    return result;
}

fn controlPoints(a: std.mem.Allocator) !void {
    const host = "<p:run><p:t>A😀" ++ tab ++ "B" ++ line ++ "C</p:t>" ++ picture ++ "<p:t>D</p:t></p:run>";
    const witness = "A😀\tB\nC\xef\xbf\xbcD";
    for ([_]u32{ 0, 1, 3, 4, 5, 6, 7, 8, 9 }) |unit| {
        const result = try insertAt(a, host, witness, unit);
        defer a.free(result);
        for ([_][]const u8{ tab, line, picture }) |raw| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, raw));
        try std.testing.expect(std.mem.indexOf(u8, result, "<p:linesegarray/>") == null);
        const text = try projected(a, result);
        defer a.free(text);
        const byte = try @import("../image/image_insertion.zig").byteOffset(witness, unit);
        const expected = try std.fmt.allocPrint(a, "{s}\xef\xbf\xbc{s}", .{ witness[0..byte], witness[byte..] });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, text);
    }
    try std.testing.expectError(error.InvalidPictureInsertionPosition, insertAt(a, host, witness, 2));
}
test "HWPX inline placement anchored cell scalar carets retain tab linebreak and protected payload byte exact" {
    try controlPoints(std.testing.allocator);
}
test "HWPX inline placement anchored cell scalar serialization allocation failures are atomic" {
    try @import("../testing/allocation_failures.zig").check(controlPoints, .{});
}
test "HWPX inline placement anchor-only tab-only and runless cells have real source boundaries" {
    const a = std.testing.allocator;
    for ([_][2][]const u8{
        .{ "<p:run>" ++ picture ++ "</p:run>", "\xef\xbf\xbc" },
        .{ "<p:run><p:t>" ++ tab ++ "</p:t></p:run>", "\t" },
        .{ "<p:run/>", "" },
        .{ "<p:run><p:t><![CDATA[A]]>B</p:t></p:run>", "AB" },
    }) |pair| {
        const length = try @import("text_site_edit.zig").utf16Length(pair[1]);
        for (0..length + 1) |unit| {
            const result = try insertAt(a, pair[0], pair[1], @intCast(unit));
            defer a.free(result);
            const text = try projected(a, result);
            defer a.free(text);
            const byte = try @import("../image/image_insertion.zig").byteOffset(pair[1], @intCast(unit));
            const expected = try std.fmt.allocPrint(a, "{s}\xef\xbf\xbc{s}", .{ pair[1][0..byte], pair[1][byte..] });
            defer a.free(expected);
            try std.testing.expectEqualStrings(expected, text);
        }
    }
}
test "HWPX inline placement anchor path still rejects unknown objects unknown controls comments and fields" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.UnsupportedInlineObjectOwner, insertAt(a, "<p:run><p:t>A</p:t><p:unknownObj/></p:run>", "A\xef\xbf\xbc", 0));
    try std.testing.expectError(error.UnsupportedParagraphControl, insertAt(a, "<p:run><p:t>A</p:t><p:unknown/></p:run>", "A", 0));
    try std.testing.expectError(error.UnsupportedInlineObjectTextSegments, insertAt(a, "<p:run><p:t>A<!--keep-->B</p:t></p:run>", "AB", 0));
    try std.testing.expectError(error.ProtectedFieldRange, insertAt(a, "<p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A</p:t></p:run>", "A", 0));
}
