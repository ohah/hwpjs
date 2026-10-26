const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const ast = @import("ast.zig");
fn first(tree: *const ast.Tree) usize {
    return tree.children[tree.nodes[tree.root].data.row.start];
}
fn check(a: std.mem.Allocator) !void {
    const source = "LEFT ( {x over y} + LEFT [z RIGHT ) RIGHT ] ^2";
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    try t.expectEqualStrings(source, tree.source);
    const scripts = tree.nodes[first(&tree)].data.scripts;
    const pair = tree.nodes[scripts.base].data.delimited;
    try t.expectEqualStrings("(", pair.left.?.value);
    try t.expectEqualStrings("]", pair.right.?.value);
    var nested: usize = 0;
    for (tree.nodes) |node| if (node.data == .delimited) {
        nested += 1;
        try t.expect(node.data.delimited.body < scripts.base);
    };
    try t.expectEqual(@as(usize, 2), nested);
    var plan = try @import("measurement_plan.zig").build(a, &tree, .{ .size = 20, .script_scale = 0.7, .fraction_scale = 0.9 });
    defer plan.deinit();
    try t.expect(plan.ready());
}
test "equation paired delimiters retain nested mixed ends script attachment and allocation ownership" {
    try check(t.allocator);
    try @import("../testing/allocation_failures.zig").check(check, .{});
}
test "equation paired delimiters preserve visible braces bars hidden sides and dangling commands" {
    for ([_][]const u8{ "LEFT {x RIGHT }", "LEFT |x RIGHT |", "LEFT . x RIGHT )", "LEFT ( RIGHT )", "LEFT ( {x} RIGHT )", "LEFT <x RIGHT >" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        try t.expect(tree.nodes[first(&tree)].data == .delimited);
        try t.expectEqualStrings(source, tree.source);
    }
    var double = try parser.parse(t.allocator, "LEFT ||x RIGHT VERT", .{});
    defer double.deinit();
    try t.expectEqualStrings("||", double.nodes[first(&double)].data.delimited.left.?.value);
    for ([_][]const u8{ "LEFT ( x", "LEFT x RIGHT y", "RIGHT )" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        try t.expect(tree.nodes[first(&tree)].data == .command);
        try t.expectEqualStrings(source, tree.source);
    }
}
test "equation paired delimiters bound scans and refuse stolen operands and cell boundaries" {
    try t.expectError(error.EquationDelimiterScanLimitExceeded, parser.parse(t.allocator, "LEFT (x RIGHT )", .{ .max_scan_steps = 0 }));
    try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, "LEFT (x over RIGHT )", .{}));
    try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, "LEFT (sqrt RIGHT )", .{}));
    var crossed_cell = try parser.parse(t.allocator, "matrix{LEFT (x&y RIGHT )}", .{});
    defer crossed_cell.deinit();
    for (crossed_cell.nodes) |node| try t.expect(node.data != .delimited);
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, "LEFT (LEFT (x RIGHT ) RIGHT )", .{ .max_depth = 2 }));
}

test "equation paired delimiters preserve actual crossed structural brace source without inventing a pair" {
    const source = "=2 ^{2} +1 ^{2} - left(`{BOX{````-2 ````}`right)}";
    var tree = try parser.parse(t.allocator, source, .{ .delimiter_policy = .preserve_with_diagnostics });
    defer tree.deinit();
    try t.expectEqualStrings(source, tree.source);
    for (tree.nodes) |node| try t.expect(node.data != .delimited);
}
