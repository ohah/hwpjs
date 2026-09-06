const Tree = @import("tree.zig").Tree;
const curve = @import("shape_curve.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { curves: usize = 0, points: usize = 0, segments: usize = 0, short_point_sets: usize = 0, unknown_segments: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, layout: curve.Layout) !Report {
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (owned.componentChild(tree, index, id("$cur"), curve.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanCurve,
            error.MissingChildRecord => error.MissingCurve,
            error.DuplicateChildRecord => error.DuplicateCurve,
            else => err,
        }) orelse continue;
        const p = try curve.Curve.parse(tree.nodes[child].record.framing.payload, layout);
        report.curves += 1;
        report.points += p.points.count();
        report.segments += p.segments.len;
        report.short_point_sets += @intFromBool(p.points.count() < 2);
        for (p.segments) |value| report.unknown_segments += @intFromBool(value > 1);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
