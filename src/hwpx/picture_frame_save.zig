//! Binds original picture owners into current text XML before frame writes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
fn identity(tree: *const Tree, node: usize) bool {
    if (@import("picture_source_identity.zig").isOwner(tree, node)) return true;
    if (tree.elements[node].parent) |parent| if (fields.childIs(tree, parent, "pic") and (fields.childIs(tree, node, "pos") or fields.childIs(tree, node, "rotationInfo"))) return true;
    return false;
}
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const @import("picture_frame_values.zig").Entry, limit: usize) ![]u8 {
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
        const node = mapping.get(entry.picture_node) orelse return error.SourceBindingMismatch;
        const tags = try @import("picture_frame_write.zig").tags(a, &current, node, entry.update, limit);
        changes.ensureUnusedCapacity(a, tags.len) catch |err| {
            for (tags) |tag| a.free(tag.bytes);
            return err;
        };
        for (tags) |tag| {
            const span = current.elements[tag.node].start_tag;
            changes.appendAssumeCapacity(.{ .start = span.start, .end = span.end, .text = "", .start_tag = tag.bytes });
        }
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, l: writer.Change, r: writer.Change) bool {
            return l.start < r.start;
        }
    }.less);
    for (changes.items, 0..) |change, i| if (i > 0 and change.start == changes.items[i - 1].start) return error.DuplicatePictureOffsetEdit;
    return writer.write(a, current.source, changes.items, limit);
}
