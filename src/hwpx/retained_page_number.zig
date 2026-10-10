//! 텍스트 위치를 차지하지 않는 쪽 번호 설정의 원문 보존 권한입니다.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const control = tree.elements[index];
    if (!control.is(uri, "ctrl") or !@import("element_whitespace_gaps.zig").empty(tree, index)) return false;
    const child = control.first_child orelse return false;
    return tree.elements[child].next_sibling == null and settingSupported(tree, child);
}

pub fn settingSupported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const setting = tree.elements[index];
    return setting.is(uri, "pageNum") and setting.first_child == null and
        @import("element_whitespace_gaps.zig").empty(tree, index);
}

test "HWPX retained page number refuses mixed settings and textual children" {
    const std = @import("std");
    const a = std.testing.allocator;
    const cases = [_]struct { body: []const u8, accepted: bool }{
        .{ .body = "<p:pageNum pos='BOTTOM_CENTER' formatType='DIGIT' sideChar=''/>", .accepted = true },
        .{ .body = "<p:pageNum/><p:colPr/>", .accepted = false },
        .{ .body = "<p:pageNum/><p:pageNum/>", .accepted = false },
        .{ .body = "<p:pageNum>text</p:pageNum>", .accepted = false },
        .{ .body = "<p:pageNum><p:t/></p:pageNum>", .accepted = false },
        .{ .body = "text<p:pageNum/>", .accepted = false },
        .{ .body = "<p:colPr/>", .accepted = false },
        .{ .body = "", .accepted = false },
    };
    for (cases) |case| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>", case.body, "</p:ctrl></p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(case.accepted, supported(&tree, 3));
        try std.testing.expect(!supported(&tree, 2));
        try std.testing.expect(!supported(&tree, tree.elements.len));
    }
}
