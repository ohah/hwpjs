const std = @import("std");
const t = std.testing;
const operators = @import("big_operator.zig");
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const policy: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
    .limit = .{ .gap = 0.1 },
};
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    var found = false;
    for (values, plan.requests, 0..) |*value, request, index| {
        const command = plan.source[request.source_start..request.source_end];
        if (operators.resolve(command)) |glyph| {
            found = true;
            try t.expectEqualStrings(glyph, request.text);
            try t.expect(!request.style.italic);
        }
        value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    }
    try t.expect(found);
    var result = try layout.build(a, &tree, &plan, values, policy);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    try t.expectEqualStrings(source, plan.source);
    if (std.mem.eql(u8, source, "sum_{a}^{b}")) {
        try t.expectEqual(@as(usize, 3), result.glyphs.len);
        const base = result.glyphs[0];
        const sub = result.glyphs[1];
        const sup = result.glyphs[2];
        try t.expectApproxEqAbs(base.x + 5, sub.x + 2.5, 1e-12);
        try t.expectApproxEqAbs(base.x + 5, sup.x + 2.5, 1e-12);
        try t.expectApproxEqAbs(base.baseline + 4 + 2, sub.baseline - 6, 1e-12);
        try t.expectApproxEqAbs(base.baseline - 12 - 2, sup.baseline + 2, 1e-12);
        var missing = policy;
        missing.limit = null;
        try t.expectError(error.UnsupportedEquationLayout, layout.build(a, &tree, &plan, values, missing));
    }
}
test "equation big operators preserve source glyph spans and center upper lower limits" {
    for (operators.entries) |entry| {
        const source = try std.fmt.allocPrint(t.allocator, "{s}_{{a}}^{{b}}", .{entry.name});
        defer t.allocator.free(source);
        try check(t.allocator, source);
    }
    for ([_][]const u8{ "sum_{a}^{b}", "SUM^b_a", "bold sum_{k=1}^{10} S_k", "sum_{sum_{a}}", "sum", "sum _{k=1} ^{10} S _{k}" }) |source| try check(t.allocator, source);
    try t.expect(operators.resolve("int") == null);
    try t.expect(operators.resolve("summation") == null);
}
test "equation big operator layout retains allocation safety" {
    try @import("../testing/allocation_failures.zig").check(check, .{"sum _{k=1} ^{10} S _{k}"});
}
