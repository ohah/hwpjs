//! Raw IEEE754 halves avoid JSON integer precision loss and preserve NaN/signed zero.
const std = @import("std");
pub const Source = struct {
    component_node: usize,
    owner_node: usize,
    kind: enum { translation, scale, rotation },
    pair: ?usize,
    bits: [6][2]u32,
};
fn halves(matrix: @import("../body/rendering.zig").Matrix) [6][2]u32 {
    var out: [6][2]u32 = undefined;
    for (matrix.bits, &out) |value, *pair| pair.* = .{ @truncate(value), @truncate(value >> 32) };
    return out;
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    const component = @import("../body/shape_component.zig");
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != component.tag) continue;
        const parent = node.parent orelse return error.OrphanShapeComponent;
        const shape = try component.Component.parse(node.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, index));
        try out.append(a, .{ .component_node = index, .owner_node = parent, .kind = .translation, .pair = null, .bits = halves(shape.rendering.translation) });
        for (0..shape.rendering.pairs.count()) |ordinal| {
            const pair = shape.rendering.pairs.get(ordinal).?;
            try out.append(a, .{ .component_node = index, .owner_node = parent, .kind = .scale, .pair = ordinal, .bits = halves(pair.scale) });
            try out.append(a, .{ .component_node = index, .owner_node = parent, .kind = .rotation, .pair = ordinal, .bits = halves(pair.rotation) });
        }
    }
    return out.toOwnedSlice(a);
}
test "HWP5 drawing matrices raw bits actual grouped allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "matrix", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const expected = try read(a, bytes, source.header.version());
        defer a.free(expected);
        try std.testing.expect(expected.len > 0);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, rows: []const Source) !void {
                const values = try read(allocator, raw, version);
                defer allocator.free(values);
                try std.testing.expectEqualDeep(rows, values);
            }
        }.run, .{ bytes, source.header.version(), expected });
    }
    const special = halves(.{ .bits = .{ 0x8000000000000000, 0x7ff8000000000001, 0x7ff0000000000000, 0, 1, 0xffffffffffffffff } });
    try std.testing.expectEqual([2]u32{ 0, 0x80000000 }, special[0]);
    try std.testing.expectEqual([2]u32{ 1, 0x7ff80000 }, special[1]);
}
