const Tree = @import("tree.zig").Tree;
const arc = @import("shape_arc.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { arcs: usize = 0, parsed: usize = 0, unselected: usize = 0, unselected_bytes: usize = 0, extra_bytes: usize = 0 };
/// Ownership is always checked. Unselected payloads are retained, not declared parsed.
pub fn inspect(tree: Tree, layout: ?arc.Layout) !Report {
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (owned.componentChild(tree, index, id("$arc"), arc.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanArc,
            error.MissingChildRecord => error.MissingArc,
            error.DuplicateChildRecord => error.DuplicateArc,
            else => err,
        }) orelse continue;
        const bytes = tree.nodes[child].record.framing.payload;
        report.arcs += 1;
        if (layout) |selected| {
            const p = try arc.Arc.parse(bytes, selected);
            report.parsed += 1;
            report.extra_bytes += p.extra.len;
        } else {
            report.unselected += 1;
            report.unselected_bytes += bytes.len;
        }
    }
    return report;
}
