//! Owned polygon coordinates. Rendering transforms are applied once, not page placement.
const std = @import("std");
const polygon = @import("../body/shape_polygon.zig");
pub const Polygon = struct {
    component_node: usize,
    polygon_node: usize,
    raw_points: [][2]i32,
    points: [][2]f64,
    extra_bytes: usize,
};
pub fn free(a: std.mem.Allocator, rows: []Polygon) void {
    for (rows) |row| {
        a.free(row.raw_points);
        a.free(row.points);
    }
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, layout: polygon.Layout) ![]Polygon {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/polygon_validation.zig").inspect(tree, layout);
    var out: std.ArrayList(Polygon) = .empty;
    errdefer {
        for (out.items) |row| {
            a.free(row.raw_points);
            a.free(row.points);
        }
        out.deinit(a);
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != polygon.tag) continue;
        const parent = node.parent orelse return error.OrphanPolygon;
        const shape = try @import("../body/shape_component.zig").Component.parse(tree.nodes[parent].record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, parent));
        const source = try polygon.Polygon.parse(node.record.framing.payload, layout);
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        const raw_points = try a.alloc([2]i32, source.points.count());
        errdefer a.free(raw_points);
        const points = try a.alloc([2]f64, source.points.count());
        errdefer a.free(points);
        for (raw_points, points, 0..) |*stored, *transformed, p| {
            const point = source.points.get(p).?;
            stored.* = .{ point.x, point.y };
            transformed.* = try @import("../../geometry/affine_row.zig").transformPoint(matrix, .{ @floatFromInt(point.x), @floatFromInt(point.y) });
        }
        try out.append(a, .{ .component_node = parent, .polygon_node = index, .raw_points = raw_points, .points = points, .extra_bytes = source.extra.len });
    }
    return out.toOwnedSlice(a);
}

test "actual sungeo polygon points retain raw coordinates and release every allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/sungeo.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const rows = try read(a, raw, source.header.version(), .observed_i32_points);
    defer free(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(usize, 13), rows[0].component_node);
    // Independent CFB.js/record inventory: payload56, i32 count6, interleaved pairs, tail4.
    try std.testing.expectEqualDeep(&[_][2]i32{ .{ 2896, 5 }, .{ 0, 5 }, .{ 0, 58102 }, .{ 41998, 58102 }, .{ 41998, 5 }, .{ 39096, 0 } }, rows[0].raw_points);
    try std.testing.expectEqual(@as(usize, 4), rows[0].extra_bytes);
    try std.testing.expectEqual(rows[0].raw_points.len, rows[0].points.len);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, expected: []const Polygon) !void {
            const actual = try read(allocator, bytes, version, .observed_i32_points);
            defer free(allocator, actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw, source.header.version(), rows });
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const payload = tree.nodes[rows[0].polygon_node].record.framing.payload;
    const offset = @intFromPtr(payload.ptr) - @intFromPtr(raw.ptr);
    const malformed = try a.dupe(u8, raw);
    defer a.free(malformed);
    std.mem.writeInt(i32, malformed[offset..][0..4], -1, .little);
    try std.testing.expectError(error.NegativePointCount, read(a, malformed, source.header.version(), .observed_i32_points));
    std.mem.writeInt(i32, malformed[offset..][0..4], std.math.maxInt(i32), .little);
    try std.testing.expectError(error.UnexpectedEnd, read(a, malformed, source.header.version(), .observed_i32_points));
}
