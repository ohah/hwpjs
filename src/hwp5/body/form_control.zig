const std = @import("std");
const Tree = @import("tree.zig").Tree;
const rules = @import("control_rules.zig");
const common = @import("object_common.zig");
const envelope = @import("form_object.zig");
const property = @import("form_property_tree.zig");
pub const Options = struct { max_forms: usize = 100_000, properties: property.Options = .{} };
pub const Form = struct {
    control_node: usize,
    object_node: usize,
    other_direct_children: usize,
    common: common.Properties,
    envelope: envelope.View,
    properties: property.Tree,
};
pub const Report = struct {
    forms: []Form,
    total_property_bytes: usize,
    total_property_nodes: usize,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.forms) |*f| f.properties.deinit(a);
        a.free(self.forms);
        self.* = undefined;
    }
};
fn isForm(tree: Tree, node: usize) bool {
    const value = tree.nodes[node].record.value;
    return value == .control_header and value.control_header.id == rules.form_id;
}
/// Same unchanged Tree.parse result; borrowed payloads must outlive the report.
/// Explicit observed assembly, not automatic document validation or form editing.
pub fn collectObservedUnits(a: std.mem.Allocator, tree: Tree, options: Options) !Report {
    var forms: std.ArrayList(Form) = .empty;
    errdefer {
        for (forms.items) |*f| f.properties.deinit(a);
        forms.deinit(a);
    }
    var remaining = options.properties;
    for (tree.nodes, 0..) |node, i| {
        if (node.record.framing.tag == envelope.tag) {
            const parent = node.parent orelse return error.InvalidFormObjectOwner;
            if (!isForm(tree, parent)) return error.InvalidFormObjectOwner;
        }
        if (!isForm(tree, i)) continue;
        const parent = node.parent orelse return error.InvalidFormControlOwner;
        if (tree.nodes[parent].record.value != .header) return error.InvalidFormControlOwner;
        if (forms.items.len >= options.max_forms) return error.FormControlLimit;
        var object: ?usize = null;
        var other: usize = 0;
        var child = i + 1;
        // Each direct child is visited once; nested subtrees are not searched.
        while (child < node.subtree_end) : (child = tree.nodes[child].subtree_end) {
            if (tree.nodes[child].record.framing.tag == envelope.tag) {
                if (object != null) return error.DuplicateFormObject;
                object = child;
            } else other += 1;
        }
        const object_node = object orelse return error.MissingFormObject;
        const attributes = try common.Properties.parse(node.record.value.control_header.properties);
        const view = try envelope.View.parseObserved(tree.nodes[object_node].record.framing.payload);
        var props = try property.Tree.parseObservedUnits(a, view.properties, remaining);
        errdefer props.deinit(a);
        try forms.append(a, .{ .control_node = i, .object_node = object_node, .other_direct_children = other, .common = attributes, .envelope = view, .properties = props });
        remaining.max_input_bytes -= view.properties.len;
        remaining.max_nodes -= props.nodes.len;
    }
    return .{ .forms = try forms.toOwnedSlice(a), .total_property_bytes = options.properties.max_input_bytes - remaining.max_input_bytes, .total_property_nodes = options.properties.max_nodes - remaining.max_nodes };
}
