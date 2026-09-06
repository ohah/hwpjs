const Tree = @import("tree.zig").Tree;
const ellipse = @import("shape_ellipse.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { ellipses: usize = 0, arcs: usize = 0, interval_updates: usize = 0, unknown_attributes: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (owned.componentChild(tree, index, id("$ell"), ellipse.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanEllipse,
            error.MissingChildRecord => error.MissingEllipse,
            error.DuplicateChildRecord => error.DuplicateEllipse,
            else => err,
        }) orelse continue;
        const p = try ellipse.Ellipse.parse(tree.nodes[child].record.framing.payload);
        report.ellipses += 1;
        report.arcs += @intFromBool(p.isArc());
        report.interval_updates += @intFromBool(p.needsIntervalUpdate());
        report.unknown_attributes += @intFromBool(p.unknownBits() != 0);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
