const Tree = @import("tree.zig").Tree;
const component = @import("shape_component.zig");
const rect = @import("shape_rectangle.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { rectangles: usize = 0, out_of_range_rounding: usize = 0, extra_bytes: usize = 0 };
fn isOwner(node: @import("tree.zig").Node) !bool {
    return node.record.framing.tag == component.tag and try component.identity(node.record.framing.payload) == id("$rec");
}
pub fn inspect(tree: Tree, layout: rect.Layout) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag == rect.tag) {
            const parent = node.parent orelse return error.OrphanRectangle;
            if (!try isOwner(tree.nodes[parent])) return error.OrphanRectangle;
        }
        if (!try isOwner(node)) continue;
        const child = (owned.find(tree, index, rect.tag) catch return error.DuplicateRectangle) orelse return error.MissingRectangle;
        const p = try rect.Rectangle.parse(tree.nodes[child].record.framing.payload, layout);
        report.rectangles += 1;
        report.out_of_range_rounding += @intFromBool(p.round_rate > 100);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
