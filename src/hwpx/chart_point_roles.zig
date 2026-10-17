//! Source relationships only; does not infer axes or select OOXML compatibility branches.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Values = @import("chart_point_values.zig").Values;
const uri = @import("chart_namespace.zig").uri;

pub const Role = enum { name, category, value, x, y, bubble_size, unclassified };
pub const Binding = struct { point: usize, series_node: ?usize, plot_node: ?usize, role_node: ?usize, role: Role };

fn roleOf(tree: *const Tree, node: usize) ?Role {
    const element = tree.elements[node];
    inline for (.{ .{ "tx", Role.name }, .{ "cat", Role.category }, .{ "val", Role.value }, .{ "xVal", Role.x }, .{ "yVal", Role.y }, .{ "bubbleSize", Role.bubble_size } }) |entry| {
        if (element.is(uri, entry[0])) return entry[1];
    }
    return null;
}

pub fn collect(a: std.mem.Allocator, tree: *const Tree, values: *const Values) ![]Binding {
    try values.validateSource(tree);
    const output = try a.alloc(Binding, values.points.len);
    errdefer a.free(output);
    for (values.points, output, 0..) |point, *binding, ordinal| {
        if (point.cache_node >= tree.elements.len) return error.SourceBindingMismatch;
        binding.* = .{ .point = ordinal, .series_node = null, .plot_node = null, .role_node = null, .role = .unclassified };
        var current = tree.elements[point.cache_node].parent;
        var steps: usize = 0;
        while (current) |node| {
            if (node >= tree.elements.len or steps >= tree.elements.len) return error.SourceBindingMismatch;
            steps += 1;
            const element = tree.elements[node];
            if (element.is(uri, "ser")) {
                binding.series_node = node;
                binding.plot_node = element.parent;
                // A data role must be a direct child of this exact series.
                if (binding.role_node) |role_node| if (tree.elements[role_node].parent != node) {
                    binding.role_node = null;
                    binding.role = .unclassified;
                };
                break;
            }
            if (roleOf(tree, node)) |role| {
                if (binding.role_node == null) {
                    binding.role_node = node;
                    binding.role = role;
                }
            }
            current = element.parent;
        }
        if (binding.series_node == null) {
            binding.role_node = null;
            binding.role = .unclassified;
        }
    }
    return output;
}

test "chart source roles keep series ownership and retain unclassified title points under OOM" {
    const a = std.testing.allocator;
    const xml = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:chart><c:title><c:tx><c:strLit><c:ptCount val='1'/><c:pt idx='0'><c:v>title</c:v></c:pt></c:strLit></c:tx></c:title><c:plotArea><c:scatterChart><c:ser><c:xVal><c:numLit><c:ptCount val='1'/><c:pt idx='0'><c:v>4.30</c:v></c:pt></c:numLit></c:xVal><c:yVal><c:numLit><c:ptCount val='1'/><c:pt idx='0'><c:v>5</c:v></c:pt></c:numLit></c:yVal></c:ser></c:scatterChart></c:plotArea></c:chart></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer values.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Values) !void {
            const bindings = try collect(allocator, parsed, source);
            defer allocator.free(bindings);
            try std.testing.expectEqual(@as(usize, 3), bindings.len);
            try std.testing.expectEqual(Role.unclassified, bindings[0].role);
            try std.testing.expect(bindings[0].series_node == null);
            try std.testing.expectEqual(Role.x, bindings[1].role);
            try std.testing.expectEqual(Role.y, bindings[2].role);
            try std.testing.expectEqual(bindings[1].series_node, bindings[2].series_node);
            try std.testing.expect(parsed.elements[bindings[1].plot_node.?].is(uri, "scatterChart"));
        }
    }.run, .{ &tree, &values });
}
