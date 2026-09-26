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

test "HWPX equation caption owns ParaListType fields and exact subList source" {
    const source = prefix ++ "<p:equation><p:caption side='TOP'>" ++
        "<p:subList id='L' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='1' textWidth='4294967295' textHeight='0' hasTextRef='true' hasNumRef='0' metatag='A&amp;B'><p:p/><x:p/><p:future/></p:subList>" ++
        "<x:subList textWidth='bad'/><p:subList/></p:caption></p:equation>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.caption_sub_lists.len);
    try std.testing.expectEqual(@as(usize, 2), report.shape_children[0].caption_sub_list_count);
    try std.testing.expectEqual(@as(usize, 2), report.caption.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.caption.duplicate_sub_list);
    try std.testing.expectEqual(@as(usize, 1), report.caption.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 3), report.caption.other_direct_children);
    const first = report.caption_sub_lists[0];
    const expected = [_][]const u8{ "L", "HORIZONTAL", "BREAK", "TOP", "0", "1", "4294967295", "0", "true", "0", "A&B" };
    var value_bytes: usize = 0;
    for (first.attributes, expected) |actual, wanted| {
        try std.testing.expectEqualStrings(wanted, actual.?);
        value_bytes += wanted.len;
    }
    try std.testing.expectEqualStrings("A&B", first.get(.metatag).?);
    try std.testing.expectEqual(@as(usize, 1), first.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 2), first.other_direct_children);
    try std.testing.expectEqual(@as(usize, 0), first.shape_child_index);
    const base = @intFromPtr(report.equations[0].raw_xml.ptr);
    const offset = @intFromPtr(first.raw_xml.ptr) - base;
    try std.testing.expect(offset + first.raw_xml.len <= report.equations[0].raw_xml.len);
    try std.testing.expect(std.mem.indexOf(u8, source, first.raw_xml) != null);
    try std.testing.expectEqual(report.equations[0].raw_xml.len + value_bytes + "TOP".len, report.owned_bytes);
    try std.testing.expectEqual(@as(?[]const u8, null), report.caption_sub_lists[1].get(.metatag));
}

test "HWPX equation caption preserves absent empty unknown and per-caption order" {
    const source = prefix ++ "<p:equation><p:caption><p:subList lineWrap='' x:textWidth='bad' future='x'/></p:caption>" ++
        "<p:caption/><p:caption><p:subList textDirection='FUTURE'/></p:caption></p:equation><p:equation/>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.caption_sub_lists.len);
    try std.testing.expectEqual(@as(usize, 1), report.caption.missing_sub_list);
    try std.testing.expectEqual(@as(usize, 2), report.caption.unknown_enums);
    try std.testing.expectEqual(@as(usize, 2), report.caption.other_attributes);
    try std.testing.expectEqual(@as(usize, 0), report.shape_children[0].first_caption_sub_list);
    try std.testing.expectEqual(@as(usize, 1), report.shape_children[1].first_caption_sub_list);
    try std.testing.expectEqual(@as(usize, 0), report.shape_children[1].caption_sub_list_count);
    try std.testing.expectEqual(@as(usize, 1), report.shape_children[2].first_caption_sub_list);
    try std.testing.expectEqualStrings("", report.caption_sub_lists[0].get(.line_wrap).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.caption_sub_lists[0].get(.text_width));
    try std.testing.expectEqualStrings("FUTURE", report.caption_sub_lists[1].get(.text_direction).?);
    try std.testing.expectEqual(@as(usize, 0), report.equations[1].shape_child_count);
}

test "HWPX equation caption rejects later invalid values and enforces shared limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:equation><p:caption><p:subList textWidth='1'/><p:subList textWidth='4294967296'/></p:caption></p:equation>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, prefix ++ "<p:equation><p:caption><p:subList hasTextRef='TRUE'/></p:caption></p:equation>" ++ suffix, .{}));
    try std.testing.expectError(error.DuplicateXmlAttribute, inspect(a, prefix ++ "<p:equation><p:caption><p:subList id='x' id='y'/></p:caption></p:equation>" ++ suffix, .{}));
    const source = prefix ++ "<p:equation><p:caption><p:subList textWidth='12'><p:p/></p:subList></p:caption></p:equation>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_caption_sub_lists = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_caption_direct_paragraphs = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 1 }));
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_caption_sub_lists = 1, .max_caption_direct_paragraphs = 1, .max_attribute_bytes = 2, .max_owned_bytes = owned });
    exact.deinit();
    const second = prefix ++ "<p:equation><p:caption><p:subList/></p:caption><p:caption><p:subList/></p:caption></p:equation>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, inspect(a, second, .{ .max_caption_sub_lists = 1 }));
}

test "HWPX equation caption frees every failure including populated subList" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:equation><p:caption><p:subList id='1' textWidth='5' textDirection='HORIZONTAL'><p:p/><p:future/></p:subList></p:caption><p:script>x</p:script></p:equation>" ++ suffix, .{});
            defer report.deinit();
            try std.testing.expectEqualStrings("5", report.caption_sub_lists[0].get(.text_width).?);
        }
    }.run, .{});
}
