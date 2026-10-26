const std = @import("std");
const t = std.testing;
const geometry = @import("integral_geometry.zig");
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const policy: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
    .integral = .{ .width = 0.5, .height = 1.8, .gap = 0.1, .thickness = 0.05 },
    .delimiters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 },
};
const actual = "= int _{0} ^{2} {f LEFT ( t RIGHT ) dt} - int _{2} ^{4} {f LEFT ( t RIGHT ) dt}";
test "equation integral geometry encloses every stroke for all six forms and decimal scales" {
    for (std.meta.tags(geometry.Kind)) |kind| for (1..100) |i| {
        const size = @as(f64, @floatFromInt(i)) / 7;
        const result = try geometry.place(kind, .{ .width = size * 0.5, .height = size * 1.8, .gap = size * 0.1, .thickness = size * 0.05 }, .{});
        const count: usize = switch (kind) {
            .int => 1,
            .dint => 2,
            .tint, .oint => 3,
            .odint => 4,
            .otint => 5,
        };
        try t.expectEqual(count, result.curve_count);
        for (result.curves[0..result.curve_count]) |curve| for (curve.points) |p| {
            const half = curve.thickness / 2;
            try t.expect(p.x - half >= 0 and p.x + half <= result.box.width);
            try t.expect(p.y - half >= -result.box.ascent and p.y + half <= result.box.descent);
        };
    };
    try t.expectEqual(geometry.Kind.int, geometry.resolve("INT").?);
    try t.expect(geometry.resolve("sin") == null);
}
test "equation integral geometry rejects degenerate metrics and extent overflow" {
    const p: geometry.Parameters = .{ .width = 10, .height = 36, .gap = 2, .thickness = 1 };
    for ([_]f64{ 0, -1, std.math.nan(f64), std.math.inf(f64) }) |v| {
        var bad = p;
        bad.thickness = v;
        try t.expectError(error.InvalidEquationLayoutMetric, geometry.place(.int, bad, .{}));
    }
    try t.expectError(error.EquationLayoutLimitExceeded, geometry.place(.otint, p, .{ .max_extent = 20 }));
}
fn check(a: std.mem.Allocator, source: []const u8, curves: usize) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| {
        try t.expect(geometry.resolve(request.text) == null);
        value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    }
    var result = try layout.build(a, &tree, &plan, values, policy);
    defer result.deinit();
    try t.expectEqual(curves, result.curves.len);
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    if (std.mem.eql(u8, source, "int_0^1 {x over y}")) {
        const lower = result.glyphs[0];
        const upper = result.glyphs[1];
        try t.expectEqualStrings("0", plan.requests[lower.request].text);
        try t.expectEqualStrings("1", plan.requests[upper.request].text);
        try t.expect(lower.x > result.curves[0].points[0].x);
        try t.expect(lower.baseline > 0 and upper.baseline < -20);
    }
}
test "equation integral layout keeps actual fixture source upper lower scripts and allocation safety" {
    try check(t.allocator, actual, 6);
    for ([_][]const u8{ "int_0^1 {x over y}", "INT^1_0 {x over y}", "oint_0^1 x", "dint_0^1 x", "tint_0^1 x", "odint_0^1 x", "otint_0^1 x", "int" }, [_]usize{ 1, 1, 3, 2, 3, 4, 5, 1 }) |source, curves| try check(t.allocator, source, curves);
    try @import("../testing/allocation_failures.zig").check(check, .{ actual, 6 });
    var tree = try parser.parse(t.allocator, "int", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    var missing = policy;
    missing.integral = null;
    try t.expectError(error.UnsupportedEquationLayout, layout.build(t.allocator, &tree, &plan, &.{}, missing));
}
