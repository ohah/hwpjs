const Tree = @import("tree.zig").Tree;
const Properties = @import("index_mark.zig").Properties;
const rules = @import("control_rules.zig");
pub const Report = struct { controls: usize = 0, first_units: usize = 0, second_units: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != rules.id("idxm")) continue;
        const p = try Properties.parse(h.properties);
        report.controls += 1;
        report.first_units += p.first.len / 2;
        report.second_units += p.second.len / 2;
        report.extra_bytes += p.extra.len;
    }
    return report;
}
