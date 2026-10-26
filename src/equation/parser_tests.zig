const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const ast = @import("ast.zig");
fn row(tree: *const ast.Tree, index: usize) []const usize {
    const range = tree.nodes[index].data.row;
    return tree.children[range.start..][0..range.len];
}

test "equation parser represents grouped fractions radicals and both script orders" {
    for ([_][]const u8{ "{a+b} over sqrt{x_1^2}", "{a+b} over sqrt{x^2_1}" }) |input| {
        var tree = try parser.parse(t.allocator, input, .{});
        defer tree.deinit();
        const root = row(&tree, tree.root);
        try t.expectEqual(@as(usize, 1), root.len);
        const pair = tree.nodes[root[0]].data.fraction;
        try t.expectEqual(@as(usize, 3), row(&tree, tree.nodes[pair.top].data.group.body).len);
        const radicand = tree.nodes[tree.nodes[pair.bottom].data.radical].data.group.body;
        const scripts = tree.nodes[row(&tree, radicand)[0]].data.scripts;
        try t.expectEqualStrings("x", tree.nodes[scripts.base].data.literal.value);
        try t.expectEqualStrings("1", tree.nodes[scripts.sub.?].data.literal.value);
        try t.expectEqualStrings("2", tree.nodes[scripts.sup.?].data.literal.value);
    }
    var tree = try parser.parse(t.allocator, "a+b over c atop d", .{});
    defer tree.deinit();
    const nodes = row(&tree, tree.root);
    try t.expectEqual(@as(usize, 3), nodes.len);
    const pair = tree.nodes[nodes[2]].data.atop;
    try t.expect(tree.nodes[pair.top].data == .fraction);
    try t.expectEqualStrings("d", tree.nodes[pair.bottom].data.literal.value);
}

test "equation parser owns source and releases every successful or failed partial arena" {
    var source = [_]u8{ 'x', '^', '2' };
    var tree = try parser.parse(t.allocator, &source, .{});
    defer tree.deinit();
    source[0] = 'y';
    const scripts = tree.nodes[row(&tree, tree.root)[0]].data.scripts;
    try t.expectEqualStrings("x", tree.nodes[scripts.base].data.literal.value);
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var result = parser.parse(a, input, .{}) catch |err| {
                if (err == error.UnclosedEquationGroup) return;
                return err;
            };
            defer result.deinit();
        }
    }.run, .{"{a+b} over sqrt{x_1^2}"});
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var result = parser.parse(a, "{a+b", .{}) catch |err| {
                if (err == error.UnclosedEquationGroup) return;
                return err;
            };
            defer result.deinit();
            return error.ExpectedGroupRejection;
        }
    }.run, .{});
}

test "equation parser refuses malformed structure and bounds recursive and iterative depth" {
    for ([_][]const u8{ "over x", "x over", "x^", "_x", "x^1^2" }) |input| {
        if (std.mem.eql(u8, input, "x^1^2")) {
            try t.expectError(error.DuplicateEquationScript, parser.parse(t.allocator, input, .{}));
        } else try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, input, .{}));
    }
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, "{x", .{}));
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, "{x]", .{}));
    try t.expectError(error.UnexpectedEquationDelimiter, parser.parse(t.allocator, "x}", .{}));
    try t.expectError(error.EquationNodeLimitExceeded, parser.parse(t.allocator, "x", .{ .max_nodes = 1 }));
    try t.expectError(error.EquationEdgeLimitExceeded, parser.parse(t.allocator, "x y", .{ .max_edges = 1 }));
    try t.expectError(error.InvalidEquationDepthLimit, parser.parse(t.allocator, "x", .{ .max_depth = 65 }));
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, @import("../testing/repeated_bytes.zig").repeat("{", 80) ++ "x" ++ @import("../testing/repeated_bytes.zig").repeat("}", 80), .{}));
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, @import("../testing/repeated_bytes.zig").repeat("sqrt ", 80) ++ "x", .{}));
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, "x" ++ @import("../testing/repeated_bytes.zig").repeat(" over x", 80), .{}));
    var empty = try parser.parse(t.allocator, "{}", .{});
    defer empty.deinit();
    try t.expectEqual(@as(usize, 0), row(&empty, empty.nodes[row(&empty, empty.root)[0]].data.group.body).len);
}

test "equation parser preserves standalone visible delimiters and half open intervals" {
    for ([_][]const u8{ ")", "(a`", "(-inf,``-1]`", "[0,1)", "]x[" }) |input| {
        var tree = try parser.parse(t.allocator, input, .{});
        defer tree.deinit();
        try t.expectEqualStrings(input, tree.source);
        try t.expect(row(&tree, tree.root).len > 0);
    }
}

test "equation parser exact arena budgets and unresolved identifiers retain original spelling" {
    var exact = try parser.parse(t.allocator, "x", .{ .max_nodes = 2, .max_edges = 1, .max_depth = 2 });
    defer exact.deinit();
    try t.expectEqual(@as(usize, 2), exact.nodes.len);
    try t.expectEqual(@as(usize, 1), exact.children.len);
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, "x", .{ .max_depth = 1 }));
    var empty = try parser.parse(t.allocator, "", .{ .max_nodes = 1, .max_edges = 0, .max_depth = 1 });
    defer empty.deinit();
    try t.expectEqual(@as(usize, 0), row(&empty, empty.root).len);
    var unresolved = try parser.parse(t.allocator, "unknownWord opaque42 abc", .{});
    defer unresolved.deinit();
    const items = row(&unresolved, unresolved.root);
    try t.expectEqual(@as(usize, 3), items.len);
    for (items, [_][]const u8{ "unknownWord", "opaque42", "abc" }) |index, value| {
        try t.expectEqual(@import("token.zig").Kind.identifier, unresolved.nodes[index].data.literal.kind);
        try t.expectEqualStrings(value, unresolved.nodes[index].data.literal.value);
    }
    for (unresolved.nodes, 0..) |node, index| switch (node.data) {
        .row => |range| for (unresolved.children[range.start..][0..range.len]) |child| {
            try t.expect(child < index);
        },
        else => {},
    };
}
