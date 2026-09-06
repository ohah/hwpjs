const Tree = @import("tree.zig").Tree;
const id = @import("control_rules.zig").id;
const P = @import("ruby.zig").Properties;
pub const Report = struct { controls: usize = 0, main_units: usize = 0, sub_units: usize = 0, reserved_positions: usize = 0, reserved_alignments: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != id("tdut")) continue;
        const p = try P.parse(h.properties);
        report.controls += 1;
        report.main_units += p.main_text.len / 2;
        report.sub_units += p.sub_text.len / 2;
        report.reserved_positions += @intFromBool(p.position > 2);
        report.reserved_alignments += @intFromBool(p.alignment > 5);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
