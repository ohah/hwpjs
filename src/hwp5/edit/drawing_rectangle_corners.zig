//! Apply renderingInfo once to stored rectangle points; not final page placement.
const std = @import("std");
pub const Corners = struct {
    component_node: usize,
    rectangle_node: usize,
    round_rate: u8,
    points: [4][2]f64,
    raw_points: [4][2]i32,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Corners {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/rectangle_validation.zig").inspect(tree, .observed_points);
    var out: std.ArrayList(Corners) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 79) continue;
        const parent = node.parent orelse return error.OrphanRectangle;
        const component = tree.nodes[parent];
        const shape = try @import("../body/shape_component.zig").Component.parse(component.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, parent));
        const rectangle = try @import("../body/shape_rectangle.zig").Rectangle.parse(node.record.framing.payload, .observed_points);
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        var points: [4][2]f64 = undefined;
        var raw_points: [4][2]i32 = undefined;
        for (rectangle.points, &raw_points) |point, *result| result.* = .{ point.x, point.y };
        for (rectangle.points, &points) |point, *result| result.* = try @import("../../geometry/affine_row.zig").transformPoint(matrix, .{ @floatFromInt(point.x), @floatFromInt(point.y) });
        try out.append(a, .{ .component_node = parent, .rectangle_node = index, .round_rate = rectangle.round_rate, .points = points, .raw_points = raw_points });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 rectangle rendering corners actual scale grouped allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "matrix", "shapecontainer-2", "textbox", "shaperect" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const expected = try read(a, raw, source.header.version());
        defer a.free(expected);
        try std.testing.expect(expected.len > 0);
        if (std.mem.eql(u8, name, "matrix")) try std.testing.expectEqualDeep([4][2]f64{ .{ 0, 0 }, .{ 8504, 0 }, .{ 8504, 17008 }, .{ 0, 17008 } }, expected[0].points);
        try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, values: []const Corners) !void {
                const actual = try read(allocator, bytes, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(values, actual);
            }
        }.run, .{ raw, source.header.version(), expected });
    }
}
