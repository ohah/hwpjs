const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const ast = @import("ast.zig");
fn first(tree: *const ast.Tree) usize {
    return tree.children[tree.nodes[tree.root].data.row.start];
}
fn owned(a: std.mem.Allocator) !void {
    const source = "hat {vec AB + dot x}^2";
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    try t.expectEqualStrings(source, tree.source);
    const scripts = tree.nodes[first(&tree)].data.scripts;
    const decorated = tree.nodes[scripts.base].data.decoration;
    try t.expectEqualStrings("hat", decorated.token.value);
    try t.expect(tree.nodes[decorated.body].data == .group);
    var count: usize = 0;
    for (tree.nodes, 0..) |node, i| if (node.data == .decoration) {
        count += 1;
        try t.expect(node.data.decoration.body < i);
    };
    try t.expectEqual(@as(usize, 3), count);
    var plan = try @import("measurement_plan.zig").build(a, &tree, .{ .size = 20, .script_scale = 0.7, .fraction_scale = 0.9 });
    defer plan.deinit();
    try t.expect(plan.ready());
    try t.expectEqual(@as(usize, 0), plan.blockers.len);
    try t.expectEqual(@as(usize, 4), plan.requests.len);
}
test "equation decoration owns grouped nested operands scripts and all allocation failures" {
    try owned(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, owned, .{});
}
test "equation decoration recognizes registry names without duplicating aliases or dropping source" {
    for (@import("commands.zig").groups) |group| {
        if (group.family != .decoration) continue;
        for (group.names) |name| {
            const source = try std.fmt.allocPrint(t.allocator, "{s} AAA", .{name});
            defer t.allocator.free(source);
            var tree = try parser.parse(t.allocator, source, .{});
            defer tree.deinit();
            const value = tree.nodes[first(&tree)].data.decoration;
            try t.expectEqualStrings(name, value.token.value);
            try t.expectEqualStrings("AAA", tree.nodes[value.body].data.literal.value);
            try t.expectEqualStrings(source, tree.source);
        }
    }
    var upper = try parser.parse(t.allocator, "HAT A^2 + hatter", .{});
    defer upper.deinit();
    const scripts = upper.nodes[first(&upper)].data.scripts;
    try t.expectEqualStrings("HAT", upper.nodes[scripts.base].data.decoration.token.value);
    const row = upper.nodes[upper.root].data.row;
    try t.expectEqualStrings("hatter", upper.nodes[upper.children[row.start + row.len - 1]].data.literal.value);
}
test "equation decoration preserves dangling and cell boundaries and enforces depth limits" {
    for ([_][]const u8{ "hat", "hat^2", "matrix{hat&x}", "LEFT (hat RIGHT )" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        for (tree.nodes) |node| try t.expect(node.data != .decoration);
        try t.expectEqualStrings(source, tree.source);
    }
    var fraction = try parser.parse(t.allocator, "hat A over B", .{});
    defer fraction.deinit();
    const pair = fraction.nodes[first(&fraction)].data.fraction;
    try t.expect(fraction.nodes[pair.top].data == .decoration);
    try t.expectEqualStrings("B", fraction.nodes[pair.bottom].data.literal.value);
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, "hat hat hat A", .{ .max_depth = 2 }));
}

test "equation decoration measurement refuses forged token spans and cyclic ownership" {
    var tree = try parser.parse(t.allocator, "bar x", .{});
    defer tree.deinit();
    const index = first(&tree);
    const original = tree.nodes[index].data.decoration;
    const options: @import("measurement_plan.zig").Options = .{ .size = 20, .script_scale = 0.7, .fraction_scale = 0.9 };
    tree.nodes[index].data.decoration.token.end = tree.source.len + 1;
    try t.expectError(error.InvalidEquationTree, @import("measurement_plan.zig").build(t.allocator, &tree, options));
    tree.nodes[index].data.decoration = original;
    tree.nodes[index].data.decoration.body = index;
    try t.expectError(error.InvalidEquationTree, @import("measurement_plan.zig").build(t.allocator, &tree, options));
}
