const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const shadow_types = [_][]const u8{ "NONE", "PARALLEL_LEFTTOP", "PARALLEL_RIGHTTOP", "PARALLEL_LEFTBOTTOM", "PARALLEL_RIGHTBOTTOM", "SHEAR_LEFTTOP", "SHEAR_RIGHTTOP", "SHEAR_LEFTBOTTOM", "SHEAR_RIGHTBOTTOM", "PERS_LEFTTOP", "PERS_RIGHTTOP", "PERS_LEFTBOTTOM", "PERS_RIGHTBOTTOM", "SCALE_NARROW", "SCALE_ENLARGE" };
pub const Values = struct { fill_node: ?usize, shadow_node: ?usize, shadow_type: ?u32 };

fn child(tree: *const Tree, node: usize, name: []const u8) !?usize {
    if (std.mem.eql(u8, name, "fillBrush")) {
        var found: ?usize = null;
        for (tree.elements, 0..) |element, index| {
            if (element.parent != node or !element.is(@import("document_xml.zig").core_uri, name)) continue;
            if (found != null) return error.DuplicateDrawingPaintChild;
            found = index;
        }
        return found;
    }
    var missing: usize = 0;
    var duplicate: usize = 0;
    const found = fields.uniqueChild(tree, node, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateDrawingPaintChild;
    return found;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "rect")) return error.InvalidDrawingTextNode;
    var result: Values = .{ .fill_node = try child(tree, node, "fillBrush"), .shadow_node = try child(tree, node, "shadow"), .shadow_type = null };
    if (result.shadow_node) |shadow| {
        if (try tree.attributeValue(a, shadow, "", "type")) |raw| {
            const value = try raw.toUtf8(a, 4096);
            defer a.free(value);
            for (shadow_types, 0..) |name, index| {
                if (std.mem.eql(u8, value, name)) {
                    result.shadow_type = @intCast(index);
                    break;
                }
            }
            if (result.shadow_type == null) return error.UnsupportedDrawingShadowType;
        }
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:rect><c:fillBrush/><p:shadow type='NONE'/></p:rect><p:rect><p:shadow/></p:rect></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Values{ .fill_node = 2, .shadow_node = 3, .shadow_type = 0 }, try read(a, &tree, 1));
    try std.testing.expectEqual(@as(?u32, null), (try read(a, &tree, 4)).shadow_type);
}

test "HWPX drawing paint actual core fill is not absent" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    const paint = try read(a, tree, 41);
    try std.testing.expect(paint.fill_node != null);
    try std.testing.expect(tree.elements[paint.fill_node.?].is(@import("document_xml.zig").core_uri, "fillBrush"));
    try std.testing.expectEqual(@as(?usize, null), (try read(a, tree, 94)).fill_node);
}

test "HWPX drawing paint ignores foreign and paragraph fill lookalikes" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:f='urn:foreign'><p:rect><p:fillBrush/><f:fillBrush/><c:fillBrush/></p:rect></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?usize, 4), (try read(a, &tree, 1)).fill_node);
}

test "HWPX drawing paint preserves absent shadow type and explicit NONE with allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX drawing paint rejects duplicate children and unknown shadow types" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:rect>";
    inline for (.{ .{ "<p:shadow/><p:shadow/>", error.DuplicateDrawingPaintChild }, .{ "<c:fillBrush/><c:fillBrush/>", error.DuplicateDrawingPaintChild }, .{ "<p:shadow type='INVALID'/>", error.UnsupportedDrawingShadowType } }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ "</p:rect></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], read(a, &tree, 1));
    }
}
