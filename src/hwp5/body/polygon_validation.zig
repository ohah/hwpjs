const Tree = @import("tree.zig").Tree;
const polygon = @import("shape_polygon.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { polygons: usize = 0, points: usize = 0, short_point_sets: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, layout: polygon.Layout) !Report {
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (owned.componentChild(tree, index, id("$pol"), polygon.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanPolygon,
            error.MissingChildRecord => error.MissingPolygon,
            error.DuplicateChildRecord => error.DuplicatePolygon,
            else => err,
        }) orelse continue;
        const p = try polygon.Polygon.parse(tree.nodes[child].record.framing.payload, layout);
        report.polygons += 1;
        report.points += p.points.count();
        report.short_point_sets += @intFromBool(p.points.count() < 3);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
