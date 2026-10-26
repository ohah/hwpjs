const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
pub const Kind = enum { areaChart, area3DChart, lineChart, line3DChart, stockChart, radarChart, scatterChart, pieChart, pie3DChart, doughnutChart, barChart, bar3DChart, ofPieChart, surfaceChart, surface3DChart, bubbleChart };

pub fn read(tree: *const Tree, node: usize) ?Kind {
    if (node >= tree.elements.len) return null;
    inline for (std.meta.tags(Kind)) |value| {
        if (tree.elements[node].is(uri, @tagName(value))) return value;
    }
    return null;
}

pub fn selected(tree: *const Tree, node: usize) ?Kind {
    const value = read(tree, node) orelse return null;
    _ = @import("chart_plot_area_owner.zig").parent(tree, node) orelse return null;
    return value;
}
