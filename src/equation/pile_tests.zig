const std = @import("std");
const t = std.testing;
const grid = @import("grid_geometry.zig");
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const policy: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
    .grid = .{ .column_gap = 0.6, .row_gap = 0.3, .padding = 0.1, .thickness = 0.05, .axis = 0.25, .minimum_row_height = 1 },
    .delimiters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 },
};
test "equation delimiter bare closes preserve nested literals and sequential expression boundaries" {
    for ([_][]const u8{ "left(x,~y)", "left(2,~6)", "= left(1,~2) + left( t,~0) ", "left(z,~w)", "LEFT[x+(y)]", "LEFT({x})" }) |source| try check(t.allocator, source);
    var tree = try parser.parse(t.allocator, "left(x) + left(y)", .{});
    defer tree.deinit();
    const row = tree.nodes[tree.root].data.row;
    try t.expectEqual(@as(usize, 3), row.len);
    try t.expectEqual(@as(usize, 7), tree.nodes[tree.children[row.start]].end);
    try t.expectEqual(@as(usize, 17), tree.nodes[tree.children[row.start + 2]].end);
    try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, "left(x over )", .{}));
    try @import("../testing/allocation_failures.zig").check(check, .{"left(x) + left(y)"});
    for ([_][]const u8{ "{LEFT(x} )", "matrix{LEFT(x&y)}", "matrix{LEFT((x&y))}", "LEFT([x)]" }) |source| {
        var rejected = try parser.parse(t.allocator, source, .{});
        defer rejected.deinit();
        var plan = try planner.build(t.allocator, &rejected, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
        defer plan.deinit();
        try t.expect(!plan.ready());
    }
}
test "equation pile geometry preserves three alignments and reserves blank rows without fake glyphs" {
    const cells = [_]grid.Cell{
        .{ .box = .{ .width = 10, .ascent = 8, .descent = 2 }, .empty = false },
        .{ .box = .{ .width = 20, .ascent = 8, .descent = 2 }, .empty = false },
        .{ .box = .{ .width = 0, .ascent = 0, .descent = 0 }, .empty = true },
    };
    const p: grid.Parameters = .{ .column_gap = 6, .row_gap = 4, .padding = 2, .thickness = 1, .axis = 5, .minimum_row_height = 20 };
    for ([_]grid.Kind{ .pile, .lpile, .rpile }, [_]f64{ 7, 2, 12 }) |kind, x| {
        var result = try grid.place(t.allocator, &cells, 3, 1, kind, p, .{});
        defer result.deinit();
        try t.expectEqual(x, result.cells[0].x);
        try t.expectEqual(@as(f64, 2), result.cells[1].x);
        try t.expectEqual(@as(f64, 68), result.box.ascent + result.box.descent);
        try t.expectEqual(@as(f64, 24), result.cells[1].baseline - result.cells[0].baseline);
        try t.expectEqual(@as(f64, 0), result.cells[2].box.ascent);
        try t.expectEqual(@as(usize, 0), result.rectangles.len);
    }
    var missing = p;
    missing.minimum_row_height = 0;
    try t.expectError(error.UnsupportedEquationGridLayout, grid.place(t.allocator, &cells, 3, 1, .pile, missing, .{}));
}
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    var result = try layout.build(a, &tree, &plan, values, policy);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    if (std.mem.eql(u8, source, "pile{ `# `}")) {
        try t.expectEqual(@as(usize, 0), plan.requests.len);
        try t.expectEqual(@as(f64, 46), result.box.ascent + result.box.descent);
    }
}
test "equation pile parser and layout keep nested expressions trailing blank rows and allocation safety" {
    for ([_][]const u8{ "pile{ `# `}", "PILE{x#y#}", "LPILE{x over y#z}", "RPILE{x#pile{y#z}}" }) |source| try check(t.allocator, source);
    try @import("../testing/allocation_failures.zig").check(check, .{"RPILE{x#pile{y#z}}"});
}
test "equation pile refuses unowned alignment columns missing braces and incomplete operands" {
    var tree = try parser.parse(t.allocator, "pile{x&y}", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(!plan.ready());
    try t.expectEqual(.grid_layout, plan.blockers[0].kind);
    try t.expectError(error.MissingEquationGridGroup, parser.parse(t.allocator, "PILE x", .{}));
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, "PILE{x", .{}));
    try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, "pile{x over #y}", .{}));
}

test "equation delimiter fragments retain absent ends instead of fabricating a pair across source objects" {
    const left_source = "LEFT ( pile{ `# `}";
    const right_source = "0 < alpha < 1 over 2  RIGHT )";
    for ([_][]const u8{ left_source, right_source }, [_]bool{ true, false }) |source, left| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        const root = tree.nodes[tree.root].data.row;
        try t.expectEqual(@as(usize, 1), root.len);
        const fragment = tree.nodes[tree.children[root.start]].data.delimited;
        try t.expectEqual(left, fragment.left != null);
        try t.expectEqual(!left, fragment.right != null);
        if (left) try t.expectEqualStrings("(", fragment.left.?.value) else try t.expectEqualStrings(")", fragment.right.?.value);
        var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
        defer plan.deinit();
        try t.expect(plan.ready());
        const values = try t.allocator.alloc(measured.Measurement, plan.requests.len);
        defer t.allocator.free(values);
        for (values, plan.requests, 0..) |*value, request, index| value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
        var result = try layout.build(t.allocator, &tree, &plan, values, policy);
        defer result.deinit();
        try t.expectEqual(@as(usize, 1), result.curves.len);
        try t.expectEqual(plan.requests.len, result.glyphs.len);
        try t.expectEqualStrings(source, tree.source);
    }
    try @import("../testing/allocation_failures.zig").check(check, .{left_source});
    try @import("../testing/allocation_failures.zig").check(check, .{right_source});
    try t.expectError(error.EquationDelimiterScanLimitExceeded, parser.parse(t.allocator, right_source, .{ .max_scan_steps = 0 }));
    var forged = try parser.parse(t.allocator, left_source, .{});
    defer forged.deinit();
    const id = forged.children[forged.nodes[forged.root].data.row.start];
    const token = forged.nodes[id].data.delimited.left.?;
    forged.nodes[id].data.delimited.left.?.end = forged.source.len + 1;
    try t.expectError(error.InvalidEquationTree, planner.build(t.allocator, &forged, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 }));
    forged.nodes[id].data.delimited.left = token;
    forged.nodes[id].data.delimited.left = null;
    try t.expectError(error.InvalidEquationTree, planner.build(t.allocator, &forged, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 }));
}
