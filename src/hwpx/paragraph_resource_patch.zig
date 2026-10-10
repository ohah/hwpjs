//! Compose source-bound property patches while retaining namespace context.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, margins: @import("paragraph_margin_patch.zig").Patch, spacing: ?@import("paragraph_spacing_patch.zig").Spacing, limit: usize) ![]u8 {
    const fragment = try @import("paragraph_margin_patch.zig").write(a, tree, node, margins, limit);
    if (spacing == null) return fragment;
    defer a.free(fragment);
    const original = tree.sourceOf(node);
    const start = @intFromPtr(original.ptr) - @intFromPtr(tree.source.ptr);
    const combined = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = start, .end = start + original.len, .text = "", .serialized_xml = fragment }}, limit);
    defer a.free(combined);
    var parsed = try @import("header_tree.zig").parse(a, combined, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    return @import("paragraph_spacing_patch.zig").write(a, &parsed, node, spacing.?, limit);
}
