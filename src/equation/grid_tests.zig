const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const ast = @import("ast.zig");
fn children(tree: *const ast.Tree, range: ast.Row) []const usize {
    return tree.children[range.start..][0..range.len];
}
fn first(tree: *const ast.Tree) usize {
    return children(tree, tree.nodes[tree.root].data.row)[0];
}
const source = "LADDER{ 2 & 12 & 18 # 3 & 6 & 9 # 2 & 3 & }";
test "equation grid preserves ladder rows trailing empty cell and exact source" {
    var tree = try parser.parse(t.allocator, source, .{});
    defer tree.deinit();
    const grid = tree.nodes[first(&tree)].data.grid;
    try t.expectEqual(ast.Grid{ .kind = .ladder, .rows = grid.rows }, grid);
    const rows = children(&tree, grid.rows);
    try t.expectEqual(@as(usize, 3), rows.len);
    for (rows) |row| try t.expectEqual(@as(usize, 3), tree.nodes[row].data.row.len);
    const last = children(&tree, tree.nodes[rows[2]].data.row);
    try t.expectEqual(@as(usize, 0), tree.nodes[last[2]].data.row.len);
    const first_cell = children(&tree, tree.nodes[children(&tree, tree.nodes[rows[0]].data.row)[0]].data.row)[0];
    try t.expectEqualStrings("2", tree.nodes[first_cell].data.literal.value);
    try t.expectEqualStrings(source, tree.source);
    var plan = try @import("measurement_plan.zig").build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    try t.expectEqual(@as(usize, 8), plan.requests.len);
    try t.expectEqual(@as(usize, 0), plan.blockers.len);
}
test "equation grid separates nested delimiters and preserves ragged rows without padding" {
    var tree = try parser.parse(t.allocator, "matrix{a&matrix{b&c#d&e}#f}", .{});
    defer tree.deinit();
    const grid = tree.nodes[first(&tree)].data.grid;
    const rows = children(&tree, grid.rows);
    try t.expectEqual(@as(usize, 2), rows.len);
    try t.expectEqual(@as(usize, 2), tree.nodes[rows[0]].data.row.len);
    try t.expectEqual(@as(usize, 1), tree.nodes[rows[1]].data.row.len);
    const cell = children(&tree, tree.nodes[rows[0]].data.row)[1];
    const nested = tree.nodes[children(&tree, tree.nodes[cell].data.row)[0]].data.grid;
    try t.expectEqual(@as(usize, 2), nested.rows.len);
    var grouped = try parser.parse(t.allocator, "sladder{{a#b}&c}", .{});
    defer grouped.deinit();
    const g = grouped.nodes[first(&grouped)].data.grid;
    try t.expectEqual(@as(usize, 1), g.rows.len);
    try t.expectEqual(@as(usize, 2), grouped.nodes[children(&grouped, g.rows)[0]].data.row.len);
    try t.expectEqual(@FieldType(ast.Grid, "kind").sladder, g.kind);
}
test "equation grid bounds partial structures and preserves explicit delimiter recovery under OOM" {
    try t.expectError(error.MissingEquationGridGroup, parser.parse(t.allocator, "LADDER x", .{}));
    for ([_][]const u8{ "matrix{x over &y}", "matrix{x_&y}", "matrix{sqrt &y}", "matrix{x over #y}" }) |bad| try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, bad, .{}));
    var empty_font = try parser.parse(t.allocator, "matrix{rm &y}", .{});
    defer empty_font.deinit();
    const font_grid = empty_font.nodes[first(&empty_font)].data.grid;
    try t.expectEqual(@as(usize, 2), empty_font.nodes[children(&empty_font, font_grid.rows)[0]].data.row.len);
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, "matrix{a&b", .{}));
    var recovered = try parser.parse(t.allocator, "matrix{a&b", .{ .delimiter_policy = .preserve_with_diagnostics });
    defer recovered.deinit();
    try t.expect(!recovered.nodes[first(&recovered)].data.grid.closed);
    try t.expectEqual(@as(usize, 1), recovered.diagnostics.len);
    try t.expectError(error.EquationEdgeLimitExceeded, parser.parse(t.allocator, source, .{ .max_edges = 2 }));
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, source, .{ .max_depth = 2 }));
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var tree = try parser.parse(a, "matrix{a&matrix{b&c#d&e}#f}", .{});
            defer tree.deinit();
            try t.expectEqual(@as(usize, 2), tree.nodes[first(&tree)].data.grid.rows.len);
        }
    }.run, .{});
}
test "equation grid parses current script from the actual ladder HWPX without changing its source" {
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, "reference/rhwp/samples/수식-문자처럼취급-아님.hwpx", t.allocator, .limited(4_000_000));
    defer t.allocator.free(input);
    var session = try @import("../hwpx/editor_session.zig").open(t.allocator, input, .{});
    defer session.deinit();
    var snapshot = try @import("../hwpx/equation_script_snapshot.zig").read(t.allocator, &session, 0, .{});
    defer snapshot.deinit();
    try t.expectEqual(@as(usize, 1), snapshot.rows.len);
    try t.expectEqualStrings(source, snapshot.rows[0].value.?);
    var tree = try parser.parse(t.allocator, snapshot.rows[0].value.?, .{});
    defer tree.deinit();
    try t.expectEqual(@as(usize, 3), tree.nodes[first(&tree)].data.grid.rows.len);
    const saved = try session.save();
    defer t.allocator.free(saved);
    try t.expectEqualSlices(u8, input, saved);
}
