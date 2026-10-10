//! 원본 선 좌표와 renderingInfo를 한 번 적용한 좌표. 페이지 원점은 포함하지 않습니다.
const std = @import("std");
pub const Endpoints = struct {
    component_node: usize,
    owner_node: usize,
    line_node: usize,
    attributes: u16,
    extra_bytes: usize,
    extra_nonzero: bool,
    raw_points: [2][2]i32,
    points: [2][2]f64,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Endpoints {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/line_validation.zig").inspect(tree);
    var out: std.ArrayList(Endpoints) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != @import("../body/shape_line.zig").tag) continue;
        const parent = node.parent orelse return error.OrphanLine;
        const component = tree.nodes[parent];
        // 연결선은 같은 tag를 쓰지만 payload 계약이 다릅니다.
        if (try @import("../body/shape_component.zig").identity(component.record.framing.payload) != @import("../body/control_rules.zig").id("$lin")) continue;
        const owner = component.parent orelse return error.OrphanShapeComponent;
        const shape = try @import("../body/shape_component.zig").Component.parse(component.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, parent));
        const line = try @import("../body/shape_line.zig").Line.parse(node.record.framing.payload);
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        const raw_points: [2][2]i32 = .{ .{ line.start_x, line.start_y }, .{ line.end_x, line.end_y } };
        var points: [2][2]f64 = undefined;
        for (raw_points, &points) |point, *result| result.* = try @import("../../geometry/affine_row.zig").transformPoint(matrix, .{ @floatFromInt(point[0]), @floatFromInt(point[1]) });
        var nonzero = false;
        for (line.extra) |byte| nonzero = nonzero or byte != 0;
        try out.append(a, .{ .component_node = parent, .owner_node = owner, .line_node = index, .attributes = line.attributes, .extra_bytes = line.extra.len, .extra_nonzero = nonzero, .raw_points = raw_points, .points = points });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 line endpoints actual transform once and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const values = try read(a, raw, source.header.version());
    defer a.free(values);
    try std.testing.expectEqual(@as(usize, 2), values.len);
    try std.testing.expectEqualDeep([2][2]i32{ .{ 0, 0 }, .{ 2100, 2050 } }, values[0].raw_points);
    try std.testing.expectEqualDeep([2][2]i32{ .{ 0, 0 }, .{ 2400, 2350 } }, values[1].raw_points);
    try std.testing.expectApproxEqAbs(@as(f64, 14800), values[1].points[1][0], 0.01);
    try std.testing.expectApproxEqAbs(@as(f64, 2150), values[1].points[1][1], 0.01);
    for (values) |value| {
        try std.testing.expectEqual(@as(u16, 0), value.attributes);
        try std.testing.expectEqual(@as(usize, 2), value.extra_bytes);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, expected: []const Endpoints) !void {
            const actual = try read(allocator, bytes, version);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw, source.header.version(), values });
}
