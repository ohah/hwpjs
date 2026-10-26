const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
fn first(tree: *@import("ast.zig").Tree) usize {
    return tree.children[tree.nodes[tree.root].data.row.start];
}
test "equation indexed radical distinguishes ROOT alias from contextual index of body" {
    var simple = try parser.parse(t.allocator, "root3 y", .{});
    defer simple.deinit();
    try t.expectEqualStrings("3", simple.nodes[simple.nodes[first(&simple)].data.radical].data.literal.value);
    try t.expectEqual(@as(usize, 2), simple.nodes[simple.root].data.row.len);
    for ([_][]const u8{ "root {4} of {x}", "ROOT {4} OF {x}", "sqrt {4} of {x}" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        const root = tree.nodes[first(&tree)].data.indexed_radical;
        try t.expect(root.index < first(&tree) and root.body < first(&tree));
        try t.expectEqualStrings(source, tree.source);
        var plan = try @import("measurement_plan.zig").build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
        defer plan.deinit();
        try t.expect(plan.ready());
        try t.expectEqualStrings("4", plan.requests[0].text);
        try t.expectEqual(@as(f64, 10), plan.requests[0].size);
        try t.expectEqualStrings("x", plan.requests[1].text);
        try t.expectEqual(@as(f64, 20), plan.requests[1].size);
    }
    var unknown = try parser.parse(t.allocator, "rootn of x", .{});
    defer unknown.deinit();
    try t.expectEqualStrings("rootn", unknown.nodes[first(&unknown)].data.literal.value);
}
test "equation indexed radical refuses missing operands and frees every partial allocation" {
    for ([_][]const u8{ "root", "root {4} of", "root {4} of }" }) |source| try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, source, .{}));
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var tree = try parser.parse(a, "root {4} of {root {3} of {x over y}}", .{});
            defer tree.deinit();
            try t.expect(tree.nodes[first(&tree)].data == .indexed_radical);
        }
    }.run, .{});
}
