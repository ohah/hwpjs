//! One parsed CTRL_DATA, with exact owner/schema/resource validation.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const names = @import("control_data_names.zig");
pub const Kind = enum { bookmark_name, shape_name, click_field_name, bookmark_field_name, presentation };

pub fn validateNode(a: std.mem.Allocator, tree: Tree, index: usize, bin_data_count: usize) !Kind {
    return inspectNode(a, tree, index, bin_data_count);
}

/// Text edits retain all resource IDs. Resource resolution belongs to the
/// document boundary; this entry checks ownership and schema only.
pub fn validateRetainedNode(a: std.mem.Allocator, tree: Tree, index: usize) !Kind {
    return inspectNode(a, tree, index, null);
}

fn inspectNode(a: std.mem.Allocator, tree: Tree, index: usize, bin_data_count: ?usize) !Kind {
    if (index >= tree.nodes.len or tree.nodes[index].record.framing.tag != 87) return error.UnsupportedControlDataOwner;
    const parent_index = tree.nodes[index].parent orelse return error.UnsupportedControlDataOwner;
    if (parent_index >= index) return error.UnsupportedControlDataOwner;
    const parent = tree.nodes[parent_index].record;
    var section = false;
    if (parent.framing.tag == @intFromEnum(@import("../body/reader.zig").Tag.control_header)) {
        const header = try @import("../body/control_header.zig").Header.parse(parent.framing.payload);
        section = header.id == @import("../body/control_rules.zig").id("secd");
    }
    // Determine the owner before allocating ParameterSet nodes.
    const owner: ?names.Owner = if (section) null else try names.ownerForTree(tree, index);
    var doc = try @import("../parameters/parser.zig").Document.parse(a, tree.nodes[index].record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    if (section) {
        try @import("control_data_presentation.zig").validate(doc);
        if (bin_data_count) |count| _ = try @import("../parameters/references.zig").validateInContext(doc, count, .section_control);
        return .presentation;
    }
    _ = try names.name(doc, owner.?);
    return switch (owner.?) {
        .bookmark => .bookmark_name,
        .shape => .shape_name,
        .click_field => .click_field_name,
        .bookmark_field => .bookmark_field_name,
    };
}
