const std = @import("std");
const tree_mod = @import("chart_tree.zig");
const model = @import("chart_point_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'>";
const suffix = "</c:chartSpace>";

test "owned chart points preserve numeric spelling source identity and decoded strings under OOM" {
    const a = std.testing.allocator;
    const xml = prefix ++ "<c:numCache><c:ptCount val='2'/><c:pt idx='1'><c:v>4.30</c:v></c:pt><c:pt idx='0'><c:v>-0</c:v></c:pt></c:numCache><c:strCache><c:ptCount val='1'/><c:pt idx='0'><c:v>_x0041_&amp;<![CDATA[😀]]></c:v></c:pt></c:strCache>" ++ suffix;
    var tree = try tree_mod.parse(a, xml, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_mod.Tree) !void {
            var values = try model.collect(allocator, parsed, .{});
            defer values.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), values.points.len);
            try std.testing.expectEqual(@as(u32, 1), values.points[0].index);
            try std.testing.expectEqualStrings("4.30", values.points[0].value);
            try std.testing.expectEqualStrings("-0", values.points[1].value);
            try std.testing.expectEqualStrings("A&😀", values.points[2].value);
            try std.testing.expectEqualStrings("<c:v>4.30</c:v>", parsed.sourceOf(values.points[0].value_node));
        }
    }.run, .{&tree});
    var values = try model.collect(a, &tree, .{});
    defer values.deinit(a);
    try values.validateSource(&tree);
    tree.source[0] = 'X';
    try std.testing.expectEqualStrings("4.30", values.points[0].value);
    try std.testing.expectError(error.SourceBindingMismatch, values.validateSource(&tree));
}

test "owned chart points reject invalid cache diagnostics rather than repairing indices" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<c:ptCount val='2'/><c:pt idx='0'><c:v>1</c:v></c:pt>",
        "<c:ptCount val='2'/><c:pt idx='0'><c:v>1</c:v></c:pt><c:pt idx='0'><c:v>2</c:v></c:pt>",
        "<c:ptCount val='1'/><c:pt idx='0'/>",
        "<c:ptCount val='1'/><c:pt idx='0'><c:v><c:v>1</c:v></c:v></c:pt>",
    }) |body| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, "<c:numCache>", body, "</c:numCache>", suffix });
        defer a.free(xml);
        var tree = try tree_mod.parse(a, xml, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.InvalidChartCache, model.collect(a, &tree, .{}));
        try std.testing.expectEqualStrings(xml, tree.source);
    }
}
