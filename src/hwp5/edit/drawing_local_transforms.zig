//! Derived local transforms; source matrices and page/group placement remain separate.
const std = @import("std");
pub const Transform = struct {
    component_node: usize,
    owner_node: usize,
    matrix: [6]f64,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Transform {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    var out: std.ArrayList(Transform) = .empty;
    errdefer out.deinit(a);
    const component = @import("../body/shape_component.zig");
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != component.tag) continue;
        const parent = node.parent orelse return error.OrphanShapeComponent;
        const shape = try component.Component.parse(node.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, index));
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        try out.append(a, .{ .component_node = index, .owner_node = parent, .matrix = matrix });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 local drawing transforms actual scale grouped owner allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "matrix", "shapecontainer-2", "textbox" }) |name| {
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
        for (expected) |row| try std.testing.expect(row.owner_node < row.component_node);
        if (std.mem.eql(u8, name, "matrix")) {
            try std.testing.expectEqual(@as(usize, 3), expected.len);
            const point = try @import("../../geometry/affine_row.zig").transformPoint(expected[0].matrix, .{ 8504, 8504 });
            try std.testing.expectEqual([2]f64{ 8504, 17008 }, point);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, values: []const Transform) !void {
                const actual = try read(allocator, bytes, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(values, actual);
            }
        }.run, .{ raw, source.header.version(), expected });
    }
}
