//! Transient column-control XML from immutable provenance, never cached state.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("column_boundary_position.zig").Position;
const uri = @import("document_xml.zig").paragraph_uri;

/// Coordinate placement belongs to the paragraph writer, not this serializer.
pub fn write(a: std.mem.Allocator, tree: *const Tree, boundary: Position, limit: usize) ![]u8 {
    // Preserve the full control and close its inherited namespace environment.
    return @import("xml_subtree_closure.zig").write(a, tree, try control(tree, boundary.source_element), limit);
}

pub fn control(tree: *const Tree, source_element: usize) !usize {
    if (source_element >= tree.elements.len) return error.InvalidColumnBoundarySource;
    const element = tree.elements[source_element];
    if (!element.is(uri, "colPr")) return error.InvalidColumnBoundarySource;
    const control_index = element.parent orelse return error.InvalidColumnBoundarySource;
    const node = tree.elements[control_index];
    if (!node.is(uri, "ctrl") or node.first_child != source_element or element.next_sibling != null) return error.UnsupportedMixedColumnControl;
    const run = node.parent orelse return error.InvalidColumnBoundarySource;
    if (!tree.elements[run].is(uri, "run")) return error.InvalidColumnBoundarySource;
    const paragraph = tree.elements[run].parent orelse return error.InvalidColumnBoundarySource;
    if (!tree.elements[paragraph].is(uri, "p")) return error.InvalidColumnBoundarySource;
    return control_index;
}

test "column boundary XML retains control attributes widths and namespace closure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:extension'><p:p><p:run><p:ctrl x:keep='yes'><!--keep--><p:colPr colCount='2' sameSz='0'><p:colSz width='15291' gap='1744'/><p:colSz width='15733' gap='0'/><x:future a='opaque'/></p:colPr></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var index: ?usize = null;
    for (tree.elements, 0..) |element, ordinal| if (element.is(uri, "colPr")) {
        index = ordinal;
    };
    const boundary: Position = .{ .source_element = index.?, .unit = 5, .affinity = .right };
    const serialized = try write(a, &tree, boundary, 10000);
    defer a.free(serialized);
    try std.testing.expect(std.mem.indexOf(u8, serialized, "x:keep='yes'") != null);
    try std.testing.expect(std.mem.indexOf(u8, serialized, "<!--keep-->") != null);
    try std.testing.expect(std.mem.indexOf(u8, serialized, tree.sourceOf(index.?)) != null);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", serialized, "</s:sec>" });
    defer a.free(wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    try std.testing.expect(reopened.elements[1].is(uri, "ctrl"));
    try std.testing.expect(reopened.elements[2].is(uri, "colPr"));
    try std.testing.expect(reopened.elements[5].is("urn:extension", "future"));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, boundary, serialized.len - 1));
    try std.testing.expectError(error.InvalidColumnBoundarySource, write(a, &tree, .{ .source_element = 0, .unit = 0, .affinity = .left }, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, position: Position) !void {
            const result = try write(allocator, parsed, position, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, boundary });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "column boundary XML refuses mixed controls rather than duplicating unrelated metadata" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr/><p:autoNum num='1'/></p:ctrl><p:ctrl><p:autoNum num='2'/><p:colPr/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "colPr")) {
        try std.testing.expectError(error.UnsupportedMixedColumnControl, write(a, &tree, .{ .source_element = index, .unit = 0, .affinity = .right }, 10000));
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    try std.testing.expectEqualStrings(source, tree.source);
}
