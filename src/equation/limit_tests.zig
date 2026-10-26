const std = @import("std");
const t = std.testing;
const geometry = @import("limit_geometry.zig");
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
const actual = "= lim _{t` -> `0+} {} g(x+t) lim _{t` -> `2+} {} g(x+t)";
test "equation limit geometry centers conditions above below the measured label and bounds decimal boxes" {
    for (1..128) |i| {
        const s = @as(f64, @floatFromInt(i)) / 9;
        const base = @import("layout_metrics.zig").Box{ .width = s * 20, .ascent = s * 12, .descent = s * 4 };
        const sub = @import("layout_metrics.zig").Box{ .width = s * 30, .ascent = s * 6, .descent = s * 2 };
        const sup = @import("layout_metrics.zig").Box{ .width = s * 10, .ascent = s * 6, .descent = s * 2 };
        const result = try geometry.place(base, sub, sup, .{ .gap = s * 2 }, .{});
        for ([_]@import("layout_metrics.zig").Placement{ result.base, result.sub.?, result.sup.? }) |p| {
            try t.expect(p.x >= 0 and p.x + p.box.width <= result.box.width);
            try t.expect(p.box.ascent - p.baseline <= result.box.ascent and p.box.descent + p.baseline <= result.box.descent);
        }
        try t.expectApproxEqAbs(result.base.x + base.width / 2, result.sub.?.x + sub.width / 2, s * 1e-12);
        try t.expectApproxEqAbs(base.descent + s * 2, result.sub.?.baseline - sub.ascent, s * 1e-12);
        try t.expectApproxEqAbs(-base.ascent - s * 2, result.sup.?.baseline + sup.descent, s * 1e-12);
        try t.expectEqualDeep(base, (try geometry.place(base, null, null, .{ .gap = 0 }, .{})).box);
    }
    try t.expect(geometry.resolve("lim") and geometry.resolve("Lim"));
    try t.expect(!geometry.resolve("LIM") and !geometry.resolve("sin"));
}
test "equation limit geometry rejects invalid spacing and oversized combinations" {
    const b: @import("layout_metrics.zig").Box = .{ .width = 10, .ascent = 6, .descent = 2 };
    for ([_]f64{ -1, std.math.nan(f64), std.math.inf(f64) }) |gap| try t.expectError(error.InvalidEquationLayoutMetric, geometry.place(b, b, b, .{ .gap = gap }, .{}));
    try t.expectError(error.EquationLayoutLimitExceeded, geometry.place(b, b, b, .{ .gap = 10 }, .{ .max_extent = 20 }));
}
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    var labels: usize = 0;
    for (values, plan.requests, 0..) |*value, request, index| {
        if (geometry.resolve(request.text)) {
            labels += 1;
            try t.expect(!request.style.italic);
            try t.expectEqual(if (std.mem.eql(u8, source, "lim_{lim_{x}}") and labels == 2) @as(f64, 10) else 20, request.size);
        }
        value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    }
    try t.expectEqual(if (std.mem.eql(u8, source, actual) or std.mem.eql(u8, source, "lim_{lim_{x}}")) @as(usize, 2) else 1, labels);
    var result = try layout.build(a, &tree, &plan, values, policy);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    if (std.mem.eql(u8, source, "lim_{x}")) {
        try t.expect(result.glyphs[1].baseline > result.glyphs[0].baseline);
        try t.expectApproxEqAbs(result.glyphs[0].x + values[0].box.width / 2, result.glyphs[1].x + values[1].box.width / 2, 1e-12);
    }
}
test "equation limit layout preserves actual source case condition scales and allocation safety" {
    for ([_][]const u8{ actual, "lim_{x}", "Lim_{x}^n", "lim^n_{x}", "lim_{lim_{x}}", "lim" }) |source| try check(t.allocator, source);
    try @import("../testing/allocation_failures.zig").check(check, .{actual});
    var tree = try parser.parse(t.allocator, "lim_{x}", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    const values = [_]measured.Measurement{ .{ .request = 0, .box = .{ .width = 10, .ascent = 12, .descent = 4 } }, .{ .request = 1, .box = .{ .width = 5, .ascent = 6, .descent = 2 } } };
    var missing = policy;
    missing.limit = null;
    try t.expectError(error.UnsupportedEquationLayout, layout.build(t.allocator, &tree, &plan, &values, missing));
}
