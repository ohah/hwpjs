//! Stock wrappers and up/down gap only; source drawing styles remain opaque.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Settings = struct {
    high_low_node: ?usize = null,
    up_down_node: ?usize = null,
    up_node: ?usize = null,
    down_node: ?usize = null,
    gap_width: ?scalar.Field(u32) = null,
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, plot: usize, limit: usize) !Settings {
    if (@import("chart_plot_kind.zig").selected(tree, plot) != .stockChart) return error.InvalidChartPlot;
    var result: Settings = .{};
    var child = tree.elements[plot].first_child;
    while (child) |node| {
        const element = tree.elements[node];
        if (element.is(uri, "hiLowLines")) {
            if (result.high_low_node != null) return error.DuplicateChartStockSetting;
            result.high_low_node = node;
        } else if (element.is(uri, "upDownBars")) {
            if (result.up_down_node != null) return error.DuplicateChartStockSetting;
            result.up_down_node = node;
            var inner = element.first_child;
            while (inner) |leaf| {
                const setting = tree.elements[leaf];
                if (setting.is(uri, "gapWidth")) {
                    if (result.gap_width != null) return error.DuplicateChartStockSetting;
                    const gap = try scalar.read(u32, a, tree, leaf, limit, error.InvalidChartStockSetting);
                    if (gap.value) |value| if (value > 500) return error.InvalidChartStockSetting;
                    result.gap_width = gap;
                } else if (setting.is(uri, "upBars")) {
                    if (result.up_node != null) return error.DuplicateChartStockSetting;
                    result.up_node = leaf;
                } else if (setting.is(uri, "downBars")) {
                    if (result.down_node != null) return error.DuplicateChartStockSetting;
                    result.down_node = leaf;
                }
                inner = setting.next_sibling;
            }
        } else if (element.is(uri, "upBars") or element.is(uri, "downBars")) return error.InvalidChartStockSetting;
        child = element.next_sibling;
    }
    return result;
}
