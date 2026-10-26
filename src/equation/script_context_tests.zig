const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const context = @import("script_context.zig");
const ast = @import("ast.zig");
fn text(tree: *const ast.Tree, index: usize) []const u8 {
    return tree.source[tree.nodes[index].start..tree.nodes[index].end];
}
test "equation script context resolves paired permutation prescripts and trailing subscripts" {
    var tree = try parser.parse(t.allocator, "  it _{7} rm P it _{4}=7times6times5times4 =840", .{});
    defer tree.deinit();
    const diagnostics = tree.diagnostics.len;
    var result = try context.analyze(t.allocator, &tree, .{});
    defer result.deinit();
    try t.expectEqual(@as(usize, 2), result.links.len);
    try t.expectEqual(@as(usize, 2), result.resolved_diagnostics);
    try t.expectEqual(@as(usize, 0), result.pending_diagnostics);
    try t.expectEqual(.left, result.links[0].side);
    try t.expectEqual(.right, result.links[1].side);
    try t.expectEqual(result.links[0].target, result.links[1].target);
    try t.expectEqualStrings("rm P", text(&tree, result.links[0].target));
    try t.expectEqual(diagnostics, tree.diagnostics.len);
}
test "equation script context retains operators and handles explicit blank bases" {
    for ([_][]const u8{ "{} _6 {rmC} it _r", "= _6 {rmC} it _r" }) |input| {
        var tree = try parser.parse(t.allocator, input, .{});
        defer tree.deinit();
        var result = try context.analyze(t.allocator, &tree, .{});
        defer result.deinit();
        try t.expectEqual(@as(usize, 2), result.links.len);
        try t.expectEqual(.left, result.links[0].side);
        try t.expectEqual(.right, result.links[1].side);
        try t.expectEqual(result.links[0].target, result.links[1].target);
        try t.expectEqualStrings("{rmC}", text(&tree, result.links[0].target));
        if (input[0] == '=') {
            try t.expectEqualStrings("=", text(&tree, result.links[0].retained_base.?));
        } else try t.expect(result.links[0].retained_base == null);
    }
    var pending = try parser.parse(t.allocator, "it _r", .{});
    defer pending.deinit();
    var result = try context.analyze(t.allocator, &pending, .{});
    defer result.deinit();
    try t.expectEqual(@as(usize, 0), result.links.len);
    try t.expectEqual(@as(usize, 1), result.pending_diagnostics);
    var empty_group = try parser.parse(t.allocator, "{rm} it _r", .{});
    defer empty_group.deinit();
    var empty_result = try context.analyze(t.allocator, &empty_group, .{});
    defer empty_result.deinit();
    try t.expectEqual(@as(usize, 0), empty_result.links.len);
    try t.expectEqual(@as(usize, 1), empty_result.pending_diagnostics);
}
fn allocationCase(a: std.mem.Allocator, tree: *const ast.Tree) !void {
    var result = try context.analyze(a, tree, .{});
    defer result.deinit();
    try t.expectEqual(@as(usize, 2), result.links.len);
}
fn limitedAllocationCase(a: std.mem.Allocator, tree: *const ast.Tree) !void {
    var result = context.analyze(a, tree, .{ .max_links = 1 }) catch |err| {
        if (err == error.EquationScriptContextLimitExceeded) return;
        return err;
    };
    defer result.deinit();
    return error.ExpectedContextLimit;
}
test "equation script context bounds output and rejects corrupted ownership under allocation failures" {
    var tree = try parser.parse(t.allocator, "it _7 rm P it _4", .{});
    defer tree.deinit();
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{&tree});
    try t.checkAllAllocationFailures(t.allocator, limitedAllocationCase, .{&tree});
    try t.expectError(error.EquationScriptContextLimitExceeded, context.analyze(t.allocator, &tree, .{ .max_links = 1 }));
    try t.expectError(error.EquationScriptContextLimitExceeded, context.analyze(t.allocator, &tree, .{ .max_steps = 0 }));
    const range = tree.nodes[tree.root].data.row;
    const saved = tree.children[range.start];
    tree.children[range.start] = tree.root;
    try t.expectError(error.InvalidEquationTree, context.analyze(t.allocator, &tree, .{}));
    tree.children[range.start] = saved;
    const offset = tree.diagnostics[1].offset;
    tree.diagnostics[1].offset = tree.diagnostics[0].offset;
    try t.expectError(error.InvalidEquationDiagnostics, context.analyze(t.allocator, &tree, .{}));
    tree.diagnostics[1].offset = offset;
    tree.nodes[tree.root].data.row.len = std.math.maxInt(usize);
    try t.expectError(error.InvalidEquationTree, context.analyze(t.allocator, &tree, .{}));
    tree.nodes[tree.root].data.row = range;
    try allocationCase(t.allocator, &tree);
}
