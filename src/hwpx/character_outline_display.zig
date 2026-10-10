//! Minimal explicit outline semantics. Other tokens remain unknown, never NONE.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
pub const Value = enum { none, solid, unknown };
pub fn matches(value: ?Value, requested: ?@import("../model/character_outline_kind.zig").Kind) bool {
    const kind = requested orelse return true;
    return switch (kind) {
        .none => value == null or value == .none,
        .solid => value == .solid,
        else => false,
    };
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, index: usize, limit: usize) !?Value {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    if (!tree.elements[index].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: ?Value = null;
    var child = tree.elements[index].first_child;
    while (child) |current| : (child = tree.elements[current].next_sibling) {
        if (!tree.elements[current].is(uri, "outline")) continue;
        if (result != null) return error.DuplicateCharacterOutline;
        result = .unknown;
        if (try tree.attributeValue(a, current, "", "type")) |value| {
            const token = try value.toUtf8(a, limit);
            defer a.free(token);
            result = if (std.mem.eql(u8, token, "NONE")) .none else if (std.mem.eql(u8, token, "SOLID")) .solid else .unknown;
        }
    }
    return result;
}

test "HWPX outline display preserves absent unknown namespace and duplicate boundaries" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr/><h:charPr><h:outline type='NONE'/></h:charPr><h:charPr><h:outline type='S&#79;LID'/></h:charPr><h:charPr><h:outline type='DASH'/></h:charPr><h:charPr><h:outline/></h:charPr><h:charPr><f:outline type='SOLID'/></h:charPr><h:charPr><h:outline f:type='NONE'/></h:charPr><h:charPr><h:outline/><h:outline/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const expected = [_]?Value{ null, .none, .solid, .unknown, .unknown, null, .unknown };
    var tested: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "charPr")) continue;
        if (tested == expected.len) {
            try std.testing.expectError(error.DuplicateCharacterOutline, read(a, &tree, index, 64));
        } else try std.testing.expectEqual(expected[tested], try read(a, &tree, index, 64));
        tested += 1;
    }
    try std.testing.expectEqual(expected.len + 1, tested);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            for (parsed.elements, 0..) |element, index| {
                if (!element.is(uri, "charPr")) continue;
                _ = read(allocator, parsed, index, 64) catch |err| {
                    if (err == error.DuplicateCharacterOutline) continue;
                    return err;
                };
            }
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidElementIndex, read(a, &tree, tree.elements.len, 64));
    try std.testing.expectEqualStrings(source, tree.source);
}
