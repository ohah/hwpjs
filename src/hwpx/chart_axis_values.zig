//! Axis definitions and non-invented ID resolution within one plotArea.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Kind = enum { catAx, valAx, dateAx, serAx };
pub const Position = enum { b, l, r, t };
pub const Axis = struct {
    node: usize,
    area_node: usize,
    kind: Kind,
    id: ?scalar.Field(u32) = null,
    cross_axis: ?scalar.Field(u32) = null,
    position: ?scalar.Field(Position) = null,
    deleted: ?scalar.Field(bool) = null,
    scaling: ?@import("chart_axis_scaling.zig").Scaling = null,
};
pub const Link = struct { status: enum { missing_value, missing_definition, ambiguous, resolved }, node: ?usize = null };
pub const Options = struct { max_axes: usize = 1024, max_attribute_bytes: usize = scalar.default_max_attribute_bytes };
pub const Values = struct {
    items: []Axis,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
    pub fn resolve(self: *const Values, area: usize, id: ?u32) Link {
        const wanted = id orelse return .{ .status = .missing_value };
        var found: ?usize = null;
        for (self.items) |axis| {
            if (axis.area_node != area) continue;
            const field = axis.id orelse continue;
            if (field.value == null or field.value.? != wanted) continue;
            if (found != null) return .{ .status = .ambiguous };
            found = axis.node;
        }
        return if (found) |node| .{ .status = .resolved, .node = node } else .{ .status = .missing_definition };
    }
};

pub fn collect(a: std.mem.Allocator, tree: *const Tree, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var axes: std.ArrayList(Axis) = .empty;
    defer axes.deinit(a);
    for (tree.elements, 0..) |element, node| {
        const selected: ?Kind = block: {
            inline for (std.meta.tags(Kind)) |kind| if (element.is(uri, @tagName(kind))) break :block kind;
            break :block null;
        };
        const kind = selected orelse continue;
        const area = @import("chart_plot_area_owner.zig").parent(tree, node) orelse continue;
        if (axes.items.len == options.max_axes) return error.LimitExceeded;
        var axis: Axis = .{ .node = node, .area_node = area, .kind = kind };
        var child = element.first_child;
        while (child) |index| {
            const field = tree.elements[index];
            if (field.is(uri, "axId")) {
                if (axis.id != null) return error.DuplicateChartAxisField;
                axis.id = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartAxisField);
            } else if (field.is(uri, "crossAx")) {
                if (axis.cross_axis != null) return error.DuplicateChartAxisField;
                axis.cross_axis = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartAxisField);
            } else if (field.is(uri, "axPos")) {
                if (axis.position != null) return error.DuplicateChartAxisField;
                axis.position = try scalar.read(Position, a, tree, index, options.max_attribute_bytes, error.InvalidChartAxisField);
            } else if (field.is(uri, "delete")) {
                if (axis.deleted != null) return error.DuplicateChartAxisField;
                axis.deleted = try scalar.read(bool, a, tree, index, options.max_attribute_bytes, error.InvalidChartAxisField);
            } else if (field.is(uri, "scaling")) {
                if (axis.scaling != null) return error.DuplicateChartAxisField;
                axis.scaling = try @import("chart_axis_scaling.zig").read(a, tree, index, options.max_attribute_bytes);
            }
            child = field.next_sibling;
        }
        try axes.append(a, axis);
    }
    return .{ .items = try axes.toOwnedSlice(a) };
}
