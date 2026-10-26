const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const ast = @import("ast.zig");
const font = @import("font.zig");
fn children(tree: *const ast.Tree, index: usize) []const usize {
    const range = tree.nodes[index].data.row;
    return tree.children[range.start..][0..range.len];
}
test "equation font scope binds one operand but an explicit group retains the full fraction" {
    var single = try parser.parse(t.allocator, "rm x over y", .{});
    defer single.deinit();
    const pair = single.nodes[children(&single, single.root)[0]].data.fraction;
    const styled = single.nodes[pair.top].data.styled;
    try t.expectEqual(font.Change.roman, styled.change);
    try t.expectEqualStrings("x", single.nodes[styled.body.?].data.literal.value);
    try t.expectEqualStrings("y", single.nodes[pair.bottom].data.literal.value);
    var grouped = try parser.parse(t.allocator, "rm {x over y}", .{});
    defer grouped.deinit();
    const wrapper = grouped.nodes[children(&grouped, grouped.root)[0]].data.styled;
    const body = grouped.nodes[wrapper.body.?].data.group.body;
    try t.expect(grouped.nodes[children(&grouped, body)[0]].data == .fraction);
    var nested = try parser.parse(t.allocator, "bold rm x it y", .{});
    defer nested.deinit();
    const items = children(&nested, nested.root);
    try t.expectEqual(@as(usize, 2), items.len);
    const bold = nested.nodes[items[0]].data.styled;
    try t.expectEqual(font.Change.bold, bold.change);
    try t.expectEqual(font.Change.roman, nested.nodes[bold.body.?].data.styled.change);
    try t.expectEqual(font.Change.italic, nested.nodes[items[1]].data.styled.change);
}
test "equation font scope preserves empty modifiers and does not steal structural commands" {
    for ([_][]const u8{ "rm", "{rm}", "rm LEFT x RIGHT", "it sqrt{x}", "bold root3" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        var empty: usize = 0;
        for (tree.nodes) |node| if (node.data == .styled and node.data.styled.body == null) {
            empty += 1;
        };
        try t.expectEqual(@as(usize, 1), empty);
        try t.expectEqualStrings(source, tree.source);
    }
    var function = try parser.parse(t.allocator, "sinx SUP 2", .{});
    defer function.deinit();
    try t.expectEqualStrings("sin", function.nodes[0].data.function.value);
    const items = children(&function, function.root);
    try t.expectEqual(@as(usize, 2), items.len);
    try t.expect(function.nodes[items[1]].data == .scripts);
}
test "equation font policy separates inherited bold numbers and intrinsic roman functions" {
    const initial: font.Style = .{};
    try t.expectEqualDeep(font.Style{ .italic = false }, font.apply(initial, .roman));
    const bold = font.apply(initial, .bold);
    try t.expect(bold.italic and bold.bold);
    try t.expectEqualDeep(font.Style{ .italic = false, .bold = false }, font.apply(bold, .roman));
    try t.expectEqualDeep(font.Style{ .italic = false, .bold = true }, font.number(bold));
    try t.expectEqualDeep(font.Style{ .italic = false, .bold = false }, font.function());
    try t.expect(font.apply(font.Style{ .italic = false, .bold = true }, .italic).bold);
}
test "equation font parsing frees every partial scope and bounds nested modifiers" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var tree = try parser.parse(a, "rm {bold x over it y} + sinx^2", .{});
            defer tree.deinit();
        }
    }.run, .{});
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, @import("../testing/repeated_bytes.zig").repeat("rm ", 80) ++ "x", .{}));
}

test "equation font script adjacency remains explicit unresolved scope instead of losing source" {
    for ([_][]const u8{ "rm C it _r", "it _7 rm P it _4", "bar{rm BD it ^2}" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        try t.expectEqualStrings(source, tree.source);
        try t.expect(tree.diagnostics.len > 0);
        for (tree.diagnostics) |diagnostic| try t.expectEqual(.unresolved_font_script_scope, diagnostic.kind);
    }
    try t.expectError(error.EquationDiagnosticLimitExceeded, parser.parse(t.allocator, "it _r", .{ .max_diagnostics = 0 }));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var tree = try parser.parse(a, "rm C it _r", .{});
            defer tree.deinit();
            try t.expectEqual(@as(usize, 1), tree.diagnostics.len);
        }
    }.run, .{});
}
