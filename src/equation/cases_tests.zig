const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const grid = @import("grid_geometry.zig");
const policy: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
    .grid = .{ .column_gap = 0.6, .row_gap = 0.3, .padding = 0.1, .thickness = 0.05, .axis = 0.25, .minimum_row_height = 1 },
    .delimiters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 },
};
const actual = "= {cases{~f LEFT ( x RIGHT )&~~~ LEFT ( x GEQ t RIGHT )#eqalign{#\n~-f LEFT ( x RIGHT ) +2f LEFT ( t RIGHT )}&eqalign{#\n~~~ LEFT ( x<t RIGHT )}}}";
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
    try t.expectEqualStrings(source, plan.source);
    if (std.mem.startsWith(u8, source, "cases")) try t.expectEqual(@as(usize, 2), result.curves.len);
    if (std.mem.eql(u8, source, "cases{x#y}")) {
        var missing = policy;
        missing.delimiters = null;
        try t.expectError(error.UnsupportedEquationLayout, layout.build(a, &tree, &plan, values, missing));
        missing = policy;
        missing.grid.?.minimum_row_height = 0;
        try t.expectError(error.UnsupportedEquationGridLayout, layout.build(a, &tree, &plan, values, missing));
    }
}
test "equation cases and eqalign retain nested original rows source and every measured glyph" {
    for ([_][]const u8{ actual, "cases{x#y}", "cases{x&y#z&w}", "eqalign{x&y#xx&z}", "eqalign{#x#}", "CASES{x}", "cases{eqalign{#x}&y#z&w}" }) |source| try check(t.allocator, source);
    for ([_][]const u8{ "cases{x&y#z}", "eqalign{x&y#z}", "cases{x" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{ .delimiter_policy = .preserve_with_diagnostics });
        defer tree.deinit();
        var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
        defer plan.deinit();
        try t.expect(!plan.ready());
    }
}
test "equation aligned grids preserve blank row height and column alignment without fake glyphs" {
    const small: grid.Cell = .{ .box = .{ .width = 10, .ascent = 8, .descent = 2 }, .empty = false };
    const wide: grid.Cell = .{ .box = .{ .width = 20, .ascent = 8, .descent = 2 }, .empty = false };
    const p: grid.Parameters = .{ .column_gap = 6, .row_gap = 4, .padding = 2, .thickness = 1, .axis = 5, .minimum_row_height = 20 };
    var aligned = try grid.place(t.allocator, &.{ small, wide, wide, small }, 2, 2, .eqalign, p, .{});
    defer aligned.deinit();
    try t.expectEqual(aligned.cells[0].x + 10, aligned.cells[2].x + 20);
    try t.expectEqual(aligned.cells[1].x, aligned.cells[3].x);
    var cases = try grid.place(t.allocator, &.{ small, wide, wide, small }, 2, 2, .cases, p, .{});
    defer cases.deinit();
    try t.expectEqual(cases.cells[0].x, cases.cells[2].x);
    var blank = try grid.place(t.allocator, &.{ .{ .box = .{ .width = 0, .ascent = 0, .descent = 0 }, .empty = true }, small }, 2, 1, .eqalign, p, .{});
    defer blank.deinit();
    try t.expectEqual(@as(f64, 44), blank.box.ascent + blank.box.descent);
    try t.expectEqual(@as(f64, 24), blank.cells[1].baseline - blank.cells[0].baseline);
}
test "equation cases nested allocation failure releases every partial grid and brace" {
    try @import("../testing/allocation_failures.zig").check(check, .{actual});
}
