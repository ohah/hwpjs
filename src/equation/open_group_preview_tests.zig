const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const layout = @import("ast_layout.zig");
const measured = @import("measured_requests.zig");
const source = "angle{rmP_1 OA_1 = theta ";
const options: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
};
test "equation open group preview preserves actual source and diagnostics while default remains blocked" {
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, source, .{}));
    var tree = try parser.parse(t.allocator, source, .{ .delimiter_policy = .preserve_with_diagnostics });
    defer tree.deinit();
    var strict = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer strict.deinit();
    try t.expect(!strict.ready());
    try t.expectEqual(@as(usize, 0), strict.recovered_open_groups);
    try t.expectEqual(.unclosed_group, strict.blockers[0].kind);
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75, .allow_unclosed_groups = true });
    defer plan.deinit();
    try t.expect(plan.ready());
    try t.expectEqual(@as(usize, 1), plan.recovered_open_groups);
    try t.expectEqual(@as(usize, 1), tree.diagnostics.len);
    try t.expectEqual(.missing_closing_brace, tree.diagnostics[0].kind);
    try t.expectEqual(@as(usize, 5), tree.diagnostics[0].offset);
    for (tree.nodes) |node| if (node.data == .group) try t.expect(!node.data.group.closed);
    try t.expectEqualStrings(source, tree.source);
    try t.expectEqualStrings(source, plan.source);
}
test "equation open group preview never recovers unmatched closers grids or forged EOF evidence" {
    for ([_][]const u8{ "}x", "matrix{x" }) |input| {
        var tree = try parser.parse(t.allocator, input, .{ .delimiter_policy = .preserve_with_diagnostics });
        defer tree.deinit();
        var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75, .allow_unclosed_groups = true });
        defer plan.deinit();
        try t.expect(!plan.ready());
        try t.expectEqual(@as(usize, 0), plan.recovered_open_groups);
    }
    var tree = try parser.parse(t.allocator, "{x", .{ .delimiter_policy = .preserve_with_diagnostics });
    defer tree.deinit();
    const group = tree.children[tree.nodes[tree.root].data.row.start];
    tree.nodes[group].end -= 1;
    var bad = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75, .allow_unclosed_groups = true });
    defer bad.deinit();
    try t.expect(!bad.ready());
    tree.nodes[group].end += 1;
    tree.diagnostics[0].offset = 1;
    var missing = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75, .allow_unclosed_groups = true });
    defer missing.deinit();
    try t.expect(!missing.ready());
}
fn check(a: std.mem.Allocator) !void {
    var tree = try parser.parse(a, source, .{ .delimiter_policy = .preserve_with_diagnostics });
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75, .allow_unclosed_groups = true });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    var result = try layout.build(a, &tree, &plan, values, options);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqual(@as(usize, 1), tree.diagnostics.len);
    try t.expectEqualStrings(source, tree.source);
}
test "equation open group preview releases every failed allocation and keeps actual script untouched" {
    try @import("../testing/allocation_failures.zig").check(check, .{});
}
