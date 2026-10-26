const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const options: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.1, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
    .delimiters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 },
    .radical = .{ .hook_width = 0.5, .gap = 0.1, .padding = 0.1, .thickness = 0.05 },
    .grid = .{ .column_gap = 0.6, .row_gap = 0.3, .padding = 0.1, .thickness = 0.05, .axis = 0.25 },
    .decoration = .{ .gap = 0.1, .height = 0.25, .thickness = 0.05 },
};
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    var result = try layout.build(a, &tree, &plan, values, options);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqual(std.mem.count(u8, source, "sqrt") + std.mem.count(u8, source, "root"), result.paths.len);
    for (result.paths) |path| for (path.points) |point| {
        try t.expect(point.x >= 0 and point.x <= result.box.width);
        try t.expect(point.y >= -result.box.ascent and point.y <= result.box.descent);
    };
    for (result.glyphs) |glyph| {
        try t.expect(glyph.x >= 0);
        try t.expect(glyph.x + values[glyph.request].box.width <= result.box.width);
        try t.expect(values[glyph.request].box.ascent - glyph.baseline <= result.box.ascent);
        try t.expect(values[glyph.request].box.descent + glyph.baseline <= result.box.descent);
    }
    for (result.curves) |curve| for (curve.points) |point| {
        const half = curve.thickness / 2;
        try t.expect(point.x - half >= 0 and point.x + half <= result.box.width);
        try t.expect(point.y - half >= -result.box.ascent and point.y + half <= result.box.descent);
    };
    if (std.mem.eql(u8, source, "x over y")) {
        try t.expectEqual(@as(usize, 1), result.rules.len);
        try t.expectEqual(@as(f64, 11.5), result.box.width);
        try t.expectEqual(@as(f64, -5), result.rules[0].y);
        try t.expect(result.glyphs[0].baseline < -5);
        try t.expect(result.glyphs[1].baseline > -5);
    }
}
test "equation AST layout connects measured rows fractions scripts and context carriers" {
    for ([_][]const u8{ "x+y", "x over y", "{x over y}^2", "x_2^3", "bold {it _7 rm P it _4}", "{} _7 rm P _4", "x atop y", "x~y", "sqrt{x over y}", "sqrt{sqrt{x}}^2", "root3", "root {4} of {x over y}", "matrix{x&y#a&b}", "LADDER{2&12&18#3&6&9#2&3&}", "sqrt{matrix{x&y#a&b}}" }) |source| try check(t.allocator, source);
}
test "equation AST layout frees every partial output under allocation failure" {
    try @import("../testing/allocation_failures.zig").check(check, .{"root{4}of{matrix{x over y&a#x&y}}^2 + it _7 rm P it _4"});
}

test "equation decoration AST layout connects every accent nested fractions scripts and allocation failures" {
    for (@import("commands.zig").groups) |group| {
        if (group.family != .decoration) continue;
        for (group.names) |name| {
            const source = try std.fmt.allocPrint(t.allocator, "{s} {{x over y}}^2", .{name});
            defer t.allocator.free(source);
            try check(t.allocator, source);
        }
    }
    try @import("../testing/allocation_failures.zig").check(check, .{"hat {vec {x over ddot y}}^2"});
    var tree = try parser.parse(t.allocator, "bar x", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = [_]measured.Measurement{.{ .request = 0, .box = .{ .width = 10, .ascent = 12, .descent = 4 } }};
    var missing = options;
    missing.decoration = null;
    try t.expectError(error.UnsupportedEquationLayout, layout.build(t.allocator, &tree, &plan, &values, missing));
}

test "equation AST layout nests matrix delimiters and frees curves on every allocation failure" {
    for ([_][]const u8{ "LEFT (x over y RIGHT ]^2", "LEFT {x RIGHT }", "LEFT .x RIGHT )", "LEFT ||x RIGHT VERT", "LEFT <x RIGHT >", "LEFT ( LEFT [x RIGHT ) RIGHT ]" }) |source| try check(t.allocator, source);
    try t.checkAllAllocationFailures(t.allocator, check, .{"LEFT {x over y RIGHT }^2"});
    try check(t.allocator, "(abc) {pmatrix{p#q#r}} =(ab+bq+cr)");
    for ([_][]const u8{ "pmatrix{x&y#a&b}", "BMATRIX{x#y}", "dmatrix{x&y}", "sqrt{pmatrix{x over y&bmatrix{a#b}}}^2" }) |source| try check(t.allocator, source);
    try t.checkAllAllocationFailures(t.allocator, check, .{"pmatrix{x over y&bmatrix{a#b}}^2"});
    try t.checkAllAllocationFailures(t.allocator, check, .{"(abc) {pmatrix{p#q#r}} =(ab+bq+cr)"});
}

test "equation AST layout refuses unsupported mismatched and overbudget inputs" {
    var tree = try parser.parse(t.allocator, "x", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    var values = [_]measured.Measurement{.{ .request = 0, .box = .{ .width = 10, .ascent = 12, .descent = 4 } }};
    var limited = options;
    limited.max_steps = 0;
    try t.expectError(error.EquationLayoutLimitExceeded, layout.build(t.allocator, &tree, &plan, &values, limited));
    plan.source[0] = 'y';
    try t.expectError(error.EquationMeasurementPlanMismatch, layout.build(t.allocator, &tree, &plan, &values, options));
    plan.source[0] = 'x';
    plan.requests[0].size = 19;
    try t.expectError(error.EquationMeasurementPlanMismatch, layout.build(t.allocator, &tree, &plan, &values, options));
    plan.requests[0].size = 20;
    values[0].box.width = std.math.nan(f64);
    try t.expectError(error.InvalidEquationLayoutMetric, layout.build(t.allocator, &tree, &plan, &values, options));
    var unsupported = try parser.parse(t.allocator, "SLADDER{x}", .{});
    defer unsupported.deinit();
    var blocked = try planner.build(t.allocator, &unsupported, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer blocked.deinit();
    try t.expectError(error.UnsupportedEquationLayout, layout.build(t.allocator, &unsupported, &blocked, &.{}, options));
}
