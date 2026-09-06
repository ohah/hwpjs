const Tree = @import("tree.zig").Tree;
const Node = @import("tree.zig").Node;
const component = @import("shape_component.zig");
const line = @import("shape_line.zig");
const connector = @import("shape_connector.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { lines: usize = 0, connectors: usize = 0, nonboolean_attributes: usize = 0, extra_bytes: usize = 0, control_points: usize = 0, unknown_connector_kinds: usize = 0, pending_subject_slots: usize = 0 };
fn identity(node: Node) !?u32 {
    return if (node.record.framing.tag == component.tag) try component.identity(node.record.framing.payload) else null;
}
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag == line.tag) {
            const parent = node.parent orelse return error.OrphanLine;
            const owner = (try identity(tree.nodes[parent])) orelse return error.OrphanLine;
            if (owner != id("$col") and owner != id("$lin")) return error.OrphanLine;
        }
        const owner = try identity(node);
        if (owner != id("$lin") and owner != id("$col")) continue;
        const is_connector = owner == id("$col");
        const child = (owned.find(tree, index, line.tag) catch return if (is_connector) error.DuplicateConnector else error.DuplicateLine) orelse return if (is_connector) error.MissingConnector else error.MissingLine;
        const bytes = tree.nodes[child].record.framing.payload;
        if (is_connector) {
            const p = try connector.Connector.parse(bytes);
            report.connectors += 1;
            report.control_points += p.points.count();
            report.unknown_connector_kinds += @intFromBool(p.kind_raw > 8);
            // Both endpoint slots remain semantically unchecked, including ID zero.
            report.pending_subject_slots += 2;
            report.extra_bytes += p.extra.len;
        } else {
            const p = try line.Line.parse(bytes);
            report.lines += 1;
            report.nonboolean_attributes += @intFromBool(p.attributes > 1);
            report.extra_bytes += p.extra.len;
        }
    }
    return report;
}
