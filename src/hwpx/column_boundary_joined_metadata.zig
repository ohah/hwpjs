//! Explicit right-source metadata permission for future column-aware joins.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validateRight(tree: *const Tree, owner: usize) !void {
    return validateMode(tree, owner, false, false);
}

pub fn validateRightWithAnchors(tree: *const Tree, owner: usize) !void {
    return validateMode(tree, owner, true, false);
}

/// 단 선언과 쪽 영역을 함께 보존하는 저장 어댑터 전용 허용 규칙입니다.
pub fn validateRightWithPageAreas(tree: *const Tree, owner: usize) !void {
    return validateMode(tree, owner, false, true);
}

fn validateMode(tree: *const Tree, owner: usize, anchors: bool, page_areas: bool) !void {
    if (owner >= tree.elements.len or !tree.elements[owner].is(uri, "p")) return error.InvalidParagraphElement;
    var child = tree.elements[owner].first_child;
    while (child) |index| {
        const node = tree.elements[index];
        if (node.is(uri, "run")) {
            var content = node.first_child;
            while (content) |i| {
                const element = tree.elements[i];
                if (anchors and @import("run_anchor.zig").kind(tree, i) != null) {
                    content = element.next_sibling;
                    continue;
                }
                if (element.is(uri, "ctrl")) {
                    const setting = element.first_child orelse return error.UnsupportedMergeMetadata;
                    if (tree.elements[setting].is(uri, "colPr")) {
                        _ = try @import("column_boundary_xml.zig").control(tree, setting);
                    } else if (page_areas and (tree.elements[setting].is(uri, "header") or tree.elements[setting].is(uri, "footer"))) {
                        _ = try @import("page_area_text_xml.zig").control(tree, setting);
                    } else return error.UnsupportedMergeMetadata;
                } else if (!element.is(uri, "t")) return error.UnsupportedMergeMetadata;
                content = element.next_sibling;
            }
        } else if (!node.is(uri, "linesegarray")) return error.UnsupportedMergeMetadata;
        child = node.next_sibling;
    }
}

test "joined column page area permission validates single packets without widening existing routes" {
    const std = @import("std");
    const a = std.testing.allocator;
    const area = "<p:header><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run></p:p></p:subList></p:header>";
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
    const suffix = "</p:run></p:p></s:sec>";
    var valid = try @import("xml_part_tree.zig").parse(a, prefix ++ "<p:ctrl>" ++ area ++ "</p:ctrl><p:t>A</p:t>" ++ suffix, .section, 0, 0, .{});
    defer valid.deinit(a);
    try validateRightWithPageAreas(&valid, 1);
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateRight(&valid, 1));
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateRightWithAnchors(&valid, 1));
    var mixed = try @import("xml_part_tree.zig").parse(a, prefix ++ "<p:ctrl>" ++ area ++ "<p:footer><p:subList/></p:footer></p:ctrl>" ++ suffix, .section, 0, 0, .{});
    defer mixed.deinit(a);
    try std.testing.expectError(error.UnsupportedMixedPageAreaControl, validateRightWithPageAreas(&mixed, 1));
    var section = try @import("xml_part_tree.zig").parse(a, prefix ++ "<p:secPr/>" ++ suffix, .section, 0, 0, .{});
    defer section.deinit(a);
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateRightWithPageAreas(&section, 1));
    var unknown = try @import("xml_part_tree.zig").parse(a, prefix ++ "<p:ctrl><p:pageNum/></p:ctrl>" ++ suffix, .section, 0, 0, .{});
    defer unknown.deinit(a);
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateRightWithPageAreas(&unknown, 1));
}

test "joined column anchor metadata retains objects but refuses host section declarations" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bodies = [_][]const u8{
        "<p:run><p:pic/><p:ctrl><p:colPr/></p:ctrl><p:t>A</p:t></p:run>",
        "<p:run><p:rect><p:subList><p:p><p:run><p:secPr/></p:run></p:p></p:subList></p:rect></p:run>",
        "<p:run><p:ctrl><p:footNote><p:subList><p:p><p:run><p:secPr/></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run>",
    };
    for (bodies) |body| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", body, "</p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedMergeMetadata, validateRight(&tree, 1));
        try validateRightWithAnchors(&tree, 1);
        try std.testing.expectEqualStrings(xml, tree.source);
    }
    var forbidden = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr/><p:pic/></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer forbidden.deinit(a);
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateRightWithAnchors(&forbidden, 1));
    const unsupported = [_][]const u8{
        "<p:pic/><p:ctrl><p:header/></p:ctrl>",
        "<p:pic/><p:ctrl><p:footer/></p:ctrl>",
        "<p:pic/><p:ctrl><p:footNote/><p:header/></p:ctrl>",
    };
    for (unsupported) |body| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>", body, "</p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedMergeMetadata, validateRightWithAnchors(&tree, 1));
        try std.testing.expectEqualStrings(xml, tree.source);
    }
}

test "joined column metadata permits column controls but refuses section and mixed settings" {
    const std = @import("std");
    const a = std.testing.allocator;
    const cases = [_]struct { body: []const u8, expected: ?anyerror }{
        .{ .body = "<p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>A</p:t></p:run><p:linesegarray/>", .expected = null },
        .{ .body = "<p:run><p:secPr/><p:t>A</p:t></p:run>", .expected = error.UnsupportedMergeMetadata },
        .{ .body = "<p:run><p:ctrl><p:colPr/><p:pageNum/></p:ctrl><p:t>A</p:t></p:run>", .expected = error.UnsupportedMixedColumnControl },
        .{ .body = "<p:run><p:ctrl><p:pageNum/></p:ctrl><p:t>A</p:t></p:run>", .expected = error.UnsupportedMergeMetadata },
    };
    for (cases) |case| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", case.body, "</p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        if (case.expected) |err| try std.testing.expectError(err, validateRight(&tree, 1)) else try validateRight(&tree, 1);
        try std.testing.expectError(error.InvalidParagraphElement, validateRight(&tree, 0));
    }
}
