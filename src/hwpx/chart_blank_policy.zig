const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Policy = enum { gap, zero, span };
pub const Field = scalar.Field(Policy);

/// Raw source policy only; neither a default nor a missing-series repair.
pub fn read(a: std.mem.Allocator, tree: *const Tree, limit: usize) !?Field {
    const chart = try @import("chart_owner.zig").find(tree, error.AmbiguousChartBlankPolicyOwner) orelse return null;
    var result: ?Field = null;
    var child = tree.elements[chart].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(uri, "dispBlanksAs")) continue;
        if (result != null) return error.DuplicateChartBlankPolicy;
        result = try scalar.read(Policy, a, tree, node, limit, error.InvalidChartBlankPolicy);
    }
    return result;
}
