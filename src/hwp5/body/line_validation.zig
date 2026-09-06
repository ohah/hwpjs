const Tree = @import("tree.zig").Tree;
const Node = @import("tree.zig").Node;
const component = @import("shape_component.zig");
const line = @import("shape_line.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { lines: usize = 0, deferred_connectors: usize = 0, nonboolean_attributes: usize = 0, extra_bytes: usize = 0 };
fn identity(node: Node) !?u32 {
    return if (node.record.framing.tag == component.tag) try component.identity(node.record.framing.payload) else null;
}
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag == line.tag) {
            const parent = node.parent orelse return error.OrphanLine;
            const owner = (try identity(tree.nodes[parent])) orelse return error.OrphanLine;
            if (owner == id("$col")) report.deferred_connectors += 1 else if (owner != id("$lin")) return error.OrphanLine;
        }
        if (try identity(node) != id("$lin")) continue;
        const child = (owned.find(tree, index, line.tag) catch return error.DuplicateLine) orelse return error.MissingLine;
        const p = try line.Line.parse(tree.nodes[child].record.framing.payload);
        report.lines += 1;
        report.nonboolean_attributes += @intFromBool(p.attributes > 1);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
