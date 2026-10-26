const std = @import("std");
const trees = @import("chart_tree.zig");
const policy = @import("chart_blank_policy.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:other'><c:chart>";
const suffix = "</c:chart></c:chartSpace>";

test "chart blank policy preserves absence empty attribute and all explicit policies" {
    const a = std.testing.allocator;
    inline for (.{ "", "<c:dispBlanksAs/>", "<c:dispBlanksAs val='gap'/>", "<c:dispBlanksAs val='zero'/>", "<c:dispBlanksAs val='span'/>" }, 0..) |body, index| {
        var tree = try trees.parse(a, prefix ++ body ++ suffix, 0, .{});
        defer tree.deinit(a);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const trees.Tree) !void {
                const result = try policy.read(allocator, source, 4096);
                if (index == 0) try std.testing.expect(result == null) else if (index == 1) try std.testing.expect(result.?.value == null) else {
                    const expected = [_]policy.Policy{ .gap, .zero, .span };
                    try std.testing.expectEqual(expected[index - 2], result.?.value.?);
                }
            }
        }.run, .{&tree});
    }
}

test "chart blank policy rejects duplicates invalid enums nested values and budget exhaustion" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:dispBlanksAs/><c:dispBlanksAs/>", error.DuplicateChartBlankPolicy },
        .{ "<c:dispBlanksAs val='bad'/>", error.InvalidChartBlankPolicy },
        .{ "<c:dispBlanksAs val='gap'><c:ext/></c:dispBlanksAs>", error.InvalidChartBlankPolicy },
    }) |case| {
        var tree = try trees.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], policy.read(a, &tree, 4096));
    }
    var tree = try trees.parse(a, prefix ++ "<x:dispBlanksAs val='bad'/><c:plotArea><c:dispBlanksAs val='bad'/></c:plotArea><c:dispBlanksAs val='gap'/>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(policy.Policy.gap, (try policy.read(a, &tree, 4096)).?.value.?);
    try std.testing.expectError(error.LimitExceeded, policy.read(a, &tree, 2));
}

test "chart blank policy reads actual incomplete stock fixture without inventing values" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6037/고가저가종가-계열추가.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Chart/chart1.xml").?, 4_000_000);
    defer a.free(xml);
    var tree = try trees.parse(a, xml, 0, .{});
    defer tree.deinit(a);
    const result = (try policy.read(a, &tree, 4096)).?;
    try std.testing.expectEqual(policy.Policy.gap, result.value.?);
    try std.testing.expect(tree.elements[result.node].is(@import("chart_namespace.zig").uri, "dispBlanksAs"));
    try std.testing.expectEqualSlices(u8, xml, tree.source);
}
