const Tree = @import("tree.zig").Tree;
const equation = @import("equation.zig");
const control_id = @import("control_rules.zig").equation_id;
pub const Report = struct { controls: usize = 0, script_units: usize = 0, version_units: usize = 0, font_units: usize = 0, line_mode: usize = 0, unknown_attributes: usize = 0, unknown_words: usize = 0, extra_bytes: usize = 0 };
fn isOwner(node: @import("tree.zig").Node) bool {
    return node.record.value == .control_header and node.record.value.control_header.id == control_id;
}
pub fn inspect(tree: Tree, layout: equation.Layout) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag == equation.tag) {
            const parent = node.parent orelse return error.OrphanEquation;
            if (!isOwner(tree.nodes[parent])) return error.OrphanEquation;
        }
        if (!isOwner(node)) continue;
        var child = index + 1;
        var found = false;
        while (child < node.subtree_end) : (child = tree.nodes[child].subtree_end) {
            const record = tree.nodes[child].record.framing;
            if (record.tag != equation.tag) continue;
            if (found) return error.DuplicateEquation;
            found = true;
            const p = try equation.Properties.parse(record.payload, layout);
            report.script_units += p.script.len / 2;
            report.version_units += p.version_info.len / 2;
            report.font_units += if (p.font_name) |f| f.len / 2 else 0;
            report.line_mode += @intFromBool(p.lineMode());
            report.unknown_attributes += @intFromBool(p.attributes & ~@as(u32, 1) != 0);
            report.unknown_words += @intFromBool(p.unknown != 0);
            report.extra_bytes += p.extra.len;
        }
        if (!found) return error.MissingEquation;
        report.controls += 1;
    }
    return report;
}
