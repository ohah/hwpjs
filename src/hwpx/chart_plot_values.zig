//! Plot identities for display; no point values, defaults or source XML cache.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
pub const Kind = @import("chart_plot_kind.zig").Kind;
pub const Plot = struct { node: usize, area_node: usize, kind: Kind, series_nodes: []usize };
pub const Options = struct { max_plots: usize = 128, max_series: usize = 100_000 };
pub const Values = struct {
    plots: []Plot,
    source_sha256: [32]u8,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.plots) |plot| a.free(plot.series_nodes);
        a.free(self.plots);
        self.* = undefined;
    }
};

pub const kind = @import("chart_plot_kind.zig").read;

pub fn collect(a: std.mem.Allocator, tree: *const Tree, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var plots: std.ArrayList(Plot) = .empty;
    defer plots.deinit(a);
    errdefer for (plots.items) |plot| a.free(plot.series_nodes);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        const plot_kind = @import("chart_plot_kind.zig").selected(tree, node) orelse continue;
        if (plots.items.len == options.max_plots) return error.LimitExceeded;
        var series: std.ArrayList(usize) = .empty;
        defer series.deinit(a);
        var child = element.first_child;
        while (child) |index| {
            if (tree.elements[index].is(uri, "ser")) {
                if (count == options.max_series) return error.LimitExceeded;
                count += 1;
                try series.append(a, index);
            }
            child = tree.elements[index].next_sibling;
        }
        const owned = try series.toOwnedSlice(a);
        errdefer a.free(owned);
        try plots.append(a, .{ .node = node, .area_node = element.parent.?, .kind = plot_kind, .series_nodes = owned });
    }
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
    return .{ .plots = try plots.toOwnedSlice(a), .source_sha256 = hash };
}
