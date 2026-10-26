const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const policy: layout.Options = .{
    .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
    .script = .{ .gap = 0.05, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
    .normal_space = 0.25,
    .thin_space = 0.1,
};
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var count: usize = 0;
    for (tree.nodes) |node| if (node.data == .scripts and node.data.scripts.side == .left) {
        count += 1;
    };
    try t.expect(count > 0);
    var links = try @import("script_context.zig").analyze(a, &tree, .{});
    defer links.deinit();
    for (links.links) |link| try t.expect(tree.nodes[link.script].data.scripts.side != .left);
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| {
        try t.expect(!std.ascii.eqlIgnoreCase(request.text, "LSUB"));
        try t.expect(!std.ascii.eqlIgnoreCase(request.text, "LSUP"));
        value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    }
    var result = try layout.build(a, &tree, &plan, values, policy);
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    try t.expectEqualStrings(source, plan.source);
    if (std.mem.eql(u8, source, "x LSUB a LSUP b")) {
        try t.expectEqual(@as(usize, 3), result.glyphs.len);
        const base = result.glyphs[0];
        const sub = result.glyphs[1];
        const sup = result.glyphs[2];
        try t.expect(sub.x + 5 < base.x);
        try t.expect(sup.x + 5 < base.x);
        try t.expect(sub.baseline > base.baseline);
        try t.expect(sup.baseline < base.baseline);
    }
}
test "equation explicit left scripts preserve postfix ownership empty carriers mixed sides and actual source" {
    for ([_][]const u8{ "x LSUB a LSUP b", "x LSUP b LSUB a", "x lsub y", "{x_1} LSUB {n+1}", "x_1 LSUB 2", "x LSUB 1 ^2", "bold x LSUB y", "{} LSUB {1}", "{} LSUB 1 x", "=S _{1} -a {} LSUB {1}" }) |source| try check(t.allocator, source);
    for ([_][]const u8{ "LSUB 1", "x LSUB", "x LSUP", "x LSUB a LSUB b", "matrix{x LSUB &y}" }) |source| {
        if (parser.parse(t.allocator, source, .{})) |parsed| {
            var owned = parsed;
            owned.deinit();
            return error.ExpectedLeftScriptRefusal;
        } else |_| {}
    }
}
test "equation explicit left scripts free every allocation and retain depth limits" {
    try @import("../testing/allocation_failures.zig").check(check, .{"=S _{1} -a {} LSUB {1}"});
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, "x_1 LSUB 2 ^3 LSUP 4", .{ .max_depth = 3 }));
}
test "equation explicit left script ownership rejects repeated AST edges before context bypass" {
    var tree = try parser.parse(t.allocator, "x LSUB a + y", .{});
    defer tree.deinit();
    const range = tree.nodes[tree.root].data.row;
    try t.expectEqual(@as(usize, 3), range.len);
    tree.children[range.start + 2] = tree.children[range.start];
    try t.expectError(error.InvalidEquationTree, @import("script_context.zig").analyze(t.allocator, &tree, .{}));
}
