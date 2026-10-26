//! Classify source owners without guessing from element order or text content.
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
pub const Role = enum { chart_title, axis_title, data_label, unclassified };

pub fn classify(tree: *const Tree, owner: usize) Role {
    const element = tree.elements[owner];
    if (element.is(uri, "dLbl")) return .data_label;
    if (!element.is(uri, "title")) return .unclassified;
    const parent = element.parent orelse return .unclassified;
    const container = tree.elements[parent];
    if (container.is(uri, "chart")) {
        const root = container.parent orelse return .unclassified;
        if (tree.elements[root].parent == null and tree.elements[root].is(uri, "chartSpace")) return .chart_title;
    }
    inline for (.{ "catAx", "valAx", "dateAx", "serAx" }) |name| {
        if (container.is(uri, name)) return .axis_title;
    }
    return .unclassified;
}
