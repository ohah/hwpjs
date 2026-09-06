const Tree = @import("tree.zig").Tree;
const Properties = @import("page_number.zig").Properties;
const rules = @import("control_rules.zig");
pub const Report = struct { controls: usize = 0, reserved_positions: usize = 0, nonstandard_dash: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != rules.id("pgnp")) continue;
        const p = try Properties.parse(h.properties);
        report.controls += 1;
        if (p.position() > 10) report.reserved_positions += 1;
        // Table 147 says '-', but an actual supported file stores zero here.
        if (p.dash != '-') report.nonstandard_dash += 1;
        report.extra_bytes += p.extra.len;
    }
    return report;
}
