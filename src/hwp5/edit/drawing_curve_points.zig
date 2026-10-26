//! Owned curve source samples. Native segment kinds are never flattened into lines.
const std = @import("std");
const curve = @import("../body/shape_curve.zig");
pub const Source = struct {
    component_node: usize,
    curve_node: usize,
    raw_points: [][2]i32,
    segments: []u16,
    extra_bytes: usize,
};
pub fn free(a: std.mem.Allocator, rows: []Source) void {
    for (rows) |row| {
        a.free(row.raw_points);
        a.free(row.segments);
    }
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, layout: curve.Layout) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/curve_validation.zig").inspect(tree, layout);
    var rows: std.ArrayList(Source) = .empty;
    errdefer {
        for (rows.items) |row| {
            a.free(row.raw_points);
            a.free(row.segments);
        }
        rows.deinit(a);
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != curve.tag) continue;
        const parent = node.parent orelse return error.OrphanCurve;
        const parsed = try curve.Curve.parse(node.record.framing.payload, layout);
        const points = try a.alloc([2]i32, parsed.points.count());
        errdefer a.free(points);
        const segments = try a.alloc(u16, parsed.segments.len);
        errdefer a.free(segments);
        for (points, 0..) |*point, p| {
            const stored = parsed.points.get(p).?;
            point.* = .{ stored.x, stored.y };
        }
        for (segments, parsed.segments) |*value, stored| value.* = stored;
        try rows.append(a, .{ .component_node = parent, .curve_node = index, .raw_points = points, .segments = segments, .extra_bytes = parsed.extra.len });
    }
    return rows.toOwnedSlice(a);
}
