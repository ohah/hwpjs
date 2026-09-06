const Tree = @import("tree.zig").Tree;
const component = @import("shape_component.zig");
const rules = @import("control_rules.zig");
const owned = @import("owned_record.zig");
pub const Report = struct { components: usize = 0, top_level: usize = 0, grouped: usize = 0, matrix_pairs: usize = 0, mismatched_ids: usize = 0, unknown_attributes: usize = 0, nonfinite_values: usize = 0, extra_bytes: usize = 0 };
fn gso(node: @import("tree.zig").Node) bool {
    return node.record.value == .control_header and node.record.value.control_header.id == rules.drawing_id;
}
fn nonfinite(matrix: @import("rendering.zig").Matrix) usize {
    var count: usize = 0;
    for (matrix.bits) |bits| count += @intFromBool(bits & 0x7ff0000000000000 == 0x7ff0000000000000);
    return count;
}
pub fn inspect(tree: Tree) !Report {
    return (try inspectDetailed(tree, null, 0)).shapes;
}
const styles = @import("drawing_style_validation.zig");
pub const Detailed = struct { shapes: Report, styles: styles.Report };
pub fn inspectDetailed(tree: Tree, options: ?styles.Options, bin_data_count: usize) !Detailed {
    var report: Report = .{};
    var style_report: styles.Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (gso(node)) {
            _ = (owned.find(tree, index, component.tag) catch return error.DuplicateShapeComponent) orelse return error.MissingShapeComponent;
        }
        if (node.record.framing.tag != component.tag) continue;
        const parent = node.parent orelse return error.OrphanShapeComponent;
        const owner = tree.nodes[parent];
        const layout: component.Layout = if (gso(owner)) .double_id else blk: {
            if (owner.record.framing.tag != component.tag or try component.identity(owner.record.framing.payload) != rules.id("$con")) return error.OrphanShapeComponent;
            break :blk .single_id;
        };
        const p = try component.Component.parse(node.record.framing.payload, layout);
        try style_report.add(p, options, bin_data_count);
        report.components += 1;
        if (layout == .double_id) report.top_level += 1 else report.grouped += 1;
        report.matrix_pairs += p.rendering.pairs.count();
        if (p.second_id) |second| report.mismatched_ids += @intFromBool(second != p.id);
        report.unknown_attributes += @intFromBool(p.attributes & ~@as(u32, 3) != 0);
        report.nonfinite_values += nonfinite(p.rendering.translation);
        for (0..p.rendering.pairs.count()) |i| {
            const pair = p.rendering.pairs.get(i).?;
            report.nonfinite_values += nonfinite(pair.scale) + nonfinite(pair.rotation);
        }
        report.extra_bytes += p.extra.len;
    }
    return .{ .shapes = report, .styles = style_report };
}
