const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
fn identity(tree: *const Tree, node: usize) bool {
    if (@import("picture_matrix_fields.zig").kind(tree, node) != null) return true;
    if (@import("picture_source_identity.zig").isOwner(tree, node) or fields.childIs(tree, node, "renderingInfo")) return true;
    return false;
}
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const @import("picture_matrix_edit_values.zig").Entry, limit: usize) ![]u8 {
    if (xml.len > limit or entries.len > 100000) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.start_tag.?);
        changes.deinit(a);
    }
    for (entries) |entry| {
        const node = mapping.get(entry.matrix_node) orelse return error.SourceBindingMismatch;
        const tag = try @import("picture_matrix_write.zig").write(a, &current, node, entry.values, limit);
        const span = current.elements[node].start_tag;
        changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }) catch |err| {
            a.free(tag);
            return err;
        };
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, lhs: writer.Change, rhs: writer.Change) bool {
            return lhs.start < rhs.start;
        }
    }.less);
    if (changes.items.len > 1) {
        for (changes.items[1..], changes.items[0 .. changes.items.len - 1]) |current_change, previous| {
            if (current_change.start == previous.start) return error.DuplicatePictureMatrixEdit;
        }
    }
    return writer.write(a, current.source, changes.items, limit);
}

test "picture matrix save composes shifted text and refuses duplicate edits with allocation cleanup" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>";
    const picture = "<p:pic><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo></p:pic>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:p><p:run><p:t>A</p:t>" ++ picture ++ "</p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const shifted = prefix ++ "<p:p><p:run><p:t>한😀B</p:t>" ++ picture ++ "</p:run></p:p></s:sec>";
    const entry: @import("picture_matrix_edit_values.zig").Entry = .{ .matrix_node = 6, .values = .{ 2, 0, 0, 0, 3, 0 } };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, text: []const u8, value: @import("picture_matrix_edit_values.zig").Entry) !void {
            const output = try write(allocator, source, text, &.{value}, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "한😀B") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "e1='2'") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "e5='3'") != null);
        }
    }.run, .{ &tree, shifted, entry });
    try std.testing.expectError(error.DuplicatePictureMatrixEdit, write(a, &tree, shifted, &.{ entry, entry }, 4096));
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, prefix ++ "</s:sec>", &.{entry}, 4096));
}
