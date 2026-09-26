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

test "HWPX equation comment owns decoded direct text and preserves empty duplicates" {
    const source = prefix ++ "<p:equation><p:shapeComment>A&amp;<![CDATA[<]]>&#xAC00;</p:shapeComment>" ++
        "<p:shapeComment/><p:shapeComment>tail<x:nested>ignored</x:nested>after</p:shapeComment>" ++
        "<x:shapeComment>foreign</x:shapeComment><p:script>x</p:script></p:equation>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.shape_children.len);
    try std.testing.expectEqualStrings("A&<가", report.shape_children[0].comment_value.?);
    try std.testing.expectEqualStrings("", report.shape_children[1].comment_value.?);
    try std.testing.expectEqualStrings("tailafter", report.shape_children[2].comment_value.?);
    try std.testing.expectEqual(@as(usize, 1), report.shape_children[2].direct_children);
    try std.testing.expectEqual(@as(usize, 0), report.shape_children[1].comment_value.?.len);
    try std.testing.expectEqual(@as(usize, 15), report.comment_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.shape.unknown_children);
    try std.testing.expectEqualStrings("x", report.scripts[0].value);
    try std.testing.expect(std.mem.indexOf(u8, report.shape_children[0].raw_xml, "<![CDATA[<]]>") != null);
}

test "HWPX equation comment enforces per-comment and shared byte budgets" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:equation><p:shapeComment>A&amp;B</p:shapeComment><p:shapeComment>xy</p:shapeComment></p:equation>" ++ suffix;
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_comment_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_comment_bytes = 3, .max_owned_bytes = owned });
    defer exact.deinit();
    try std.testing.expectEqualStrings("A&B", exact.shape_children[0].comment_value.?);
    try std.testing.expectEqualStrings("xy", exact.shape_children[1].comment_value.?);
}

test "HWPX equation comment survives source tree release" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:equation><p:shapeComment>&#xAC00;</p:shapeComment></p:equation>" ++ suffix;
    var report = try inspect(a, source, .{});
    defer report.deinit();
    try std.testing.expectEqualStrings("가", report.shape_children[0].comment_value.?);
    try std.testing.expectEqual(report.equations[0].raw_xml.len + 3, report.owned_bytes);
}

test "HWPX equation comment decodes both UTF16 byte orders" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:equation><p:shapeComment>&#xAC00;&amp;B</p:shapeComment></p:equation></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("가&B", report.shape_children[0].comment_value.?);
        try std.testing.expectEqual(@as(usize, 5), report.comment_bytes);
    }
}

test "HWPX equation comment frees every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:equation><p:shapeComment>A&amp;<![CDATA[B]]></p:shapeComment><p:script>x</p:script></p:equation>" ++ suffix, .{});
            report.deinit();
        }
    }.run, .{});
}
