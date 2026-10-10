//! Composes pending dimensions with text XML after validating object ownership.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const Entry = @import("picture_dimension_edit_values.zig").Entry;

fn identity(tree: *const Tree, node: usize) bool {
    for ([_][]const u8{ "pic", "container", "tbl", "tr", "tc", "subList" }) |name| if (fields.childIs(tree, node, name)) return true;
    if (tree.elements[node].parent) |owner| {
        if (fields.childIs(tree, owner, "pic")) {
            for (@import("picture_dimension_values.zig").names) |name| if (fields.childIs(tree, node, name)) return true;
        }
    }
    return false;
}

pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const Entry, limit: usize) ![]u8 {
    if (xml.len > limit or entries.len > 100000) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (entries) |entry| {
        const node = mapping.get(entry.picture_node) orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&current, node, "pic")) return error.SourceBindingMismatch;
        const existing = try seen.getOrPut(a, entry.picture_node);
        if (existing.found_existing) return error.DuplicatePictureDimensionEdit;
        const output = try @import("picture_dimension_write.zig").write(a, &current, node, entry.update, limit);
        defer a.free(output);
        var next = try @import("section_tree.zig").parse(a, output, source.section_ordinal.?, source.item_index, .{});
        current.deinit(a);
        current = next;
        next = undefined;
    }
    return a.dupe(u8, current.source);
}

test "HWPX picture dimension save composes shifted text and rejects changed object structure" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const picture = "<p:pic id='1'><p:sz width='12' height='8'/><p:curSz width='0' height='0'/><p:pos allowOverlap='1'/></p:pic>";
    const original = prefix ++ "<p:p><p:run><p:t>A</p:t>" ++ picture ++ "</p:run></p:p></s:sec>";
    const shifted = prefix ++ "<p:p><p:run><p:t>한😀B</p:t>" ++ picture ++ "</p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, original, 0, 0, .{});
    defer tree.deinit(a);
    const entry: Entry = .{ .picture_node = 4, .update = .{ .display = .{ 9, 6 }, .current = .{ 9, 6 } } };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, text: []const u8, update: Entry) !void {
            const output = try write(allocator, source, text, &.{update}, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "한😀B") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:sz width='9' height='6'/>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "allowOverlap='1'") != null);
        }
    }.run, .{ &tree, shifted, entry });
    const removed = prefix ++ "<p:p><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, removed, &.{entry}, 4096));
    const moved = prefix ++ "<p:container>" ++ picture ++ "</p:container></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, moved, &.{entry}, 4096));
    try std.testing.expectError(error.DuplicatePictureDimensionEdit, write(a, &tree, shifted, &.{ entry, entry }, 4096));
    try std.testing.expectEqualStrings(original, tree.source);
}
