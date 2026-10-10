//! Form layout source snapshot. No display fallback, font resolution or mutation.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Character = struct { id: ?u32 = null, follow_context: ?bool = null, auto_size: ?bool = null, word_wrap: ?bool = null };
pub const Snapshot = struct {
    sourceOnly: bool = true,
    formNode: usize,
    kind: @import("run_anchor.zig").Kind,
    geometry: @import("picture_geometry_values.zig").Values,
    position: @import("picture_position_values.zig").Values,
    flow: @import("picture_flow_values.zig").Values,
    character: Character = .{},
    sizeProtected: ?bool = null,
};
fn child(tree: *const Tree, node: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, node, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateFormLayoutChild;
    return result;
}
fn boolean(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?bool {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try fields.boolean(a, raw, 4096);
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Snapshot {
    const kind = @import("run_anchor.zig").kind(tree, node) orelse return error.InvalidFormNode;
    if (!@import("run_anchor.zig").isForm(kind)) return error.InvalidFormNode;
    var result: Snapshot = .{ .formNode = node, .kind = kind, .geometry = try @import("picture_geometry_values.zig").readForm(a, tree, node), .position = try @import("picture_position_values.zig").readForm(a, tree, node), .flow = try @import("picture_flow_values.zig").readForm(a, tree, node) };
    if (try child(tree, node, "formCharPr")) |at| {
        result.character = .{ .id = try fields.optionalUnsigned(a, tree, at, "charPrIDRef", 4096), .follow_context = try boolean(a, tree, at, "followContext"), .auto_size = try boolean(a, tree, at, "autoSz"), .word_wrap = try boolean(a, tree, at, "wordWrap") };
    }
    if (try child(tree, node, "sz")) |at| result.sizeProtected = try boolean(a, tree, at, "protect");
    return result;
}
