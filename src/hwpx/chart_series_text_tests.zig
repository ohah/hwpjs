const std = @import("std");
const model = @import("chart_series_text_values.zig");
const writer = @import("chart_series_text_write.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'>";

test "direct chart series text retains leaf ownership escapes comments and failures" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:chart><c:title><c:tx><c:v>excluded</c:v></c:tx></c:title><c:ser><c:tx><c:v>A<!--keep--><?p keep?><![CDATA[B]]>_x000D_</c:v></c:tx><c:cat><c:strLit><c:ptCount val='1'/><c:pt idx='0'><c:v>point</c:v></c:pt></c:strLit></c:cat></c:ser><c:ser><c:tx><c:v/></c:tx></c:ser><x:ser><c:tx><c:v>foreign</c:v></c:tx></x:ser></c:chart></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var values = try model.collect(a, &tree, .{});
    defer values.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), values.items.len);
    try std.testing.expectEqualStrings("AB\r", values.items[0].text);
    try std.testing.expectEqualStrings("", values.items[1].text);
    try std.testing.expect(values.items[0].series_node != values.items[1].series_node);
    const unchanged = try writer.write(a, &tree, &values, 0, "AB\r", 10000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(source, unchanged);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, &values, 0, "AB\r", source.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree) !void {
            var collected = try model.collect(allocator, original, .{});
            defer collected.deinit(allocator);
            const changed = try writer.write(allocator, original, &collected, 0, "계열😀<&\r\x00_x0041_", 10000);
            defer allocator.free(changed);
            try std.testing.expect(std.mem.indexOf(u8, changed, "<!--keep--><?p keep?>") != null);
            try std.testing.expect(std.mem.indexOf(u8, changed, "<c:v>point</c:v>") != null);
            try std.testing.expectEqualStrings("AB\r", collected.items[0].text);
        }
    }.run, .{&tree});
    const expanded = try writer.write(a, &tree, &values, 1, "new", 10000);
    defer a.free(expanded);
    try std.testing.expect(std.mem.indexOf(u8, expanded, "<c:v>new</c:v>") != null);
    try std.testing.expectError(error.InvalidChartSeriesTextIndex, writer.write(a, &tree, &values, 2, "new", 10000));
    try std.testing.expectError(error.InvalidUtf8, writer.write(a, &tree, &values, 0, "\xff", 10000));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_values = 0 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_value_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_total_bytes = 0 }));
    const original_node = values.items[0].value_node;
    values.items[0].value_node = values.items[1].value_node;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &tree, &values, 0, "forged", 10000));
    values.items[0].value_node = original_node;
    values.source_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &tree, &values, 0, "stale", 10000));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "direct chart series text refuses ambiguous choices nested values and surrogate escapes" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:v>A</c:v><c:v>B</c:v>", .err = error.AmbiguousChartSeriesText },
        .{ .body = "<c:v>A</c:v><c:strRef/>", .err = error.AmbiguousChartSeriesText },
        .{ .body = "<c:v>A</c:v><c:rich/>", .err = error.AmbiguousChartSeriesText },
        .{ .body = "<c:v><c:ext/></c:v>", .err = error.InvalidChartSeriesText },
        .{ .body = "<c:v>_xD800_</c:v>", .err = error.InvalidChartSeriesText },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, "<c:ser><c:tx>", case.body, "</c:tx></c:ser></c:chartSpace>" });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.err, model.collect(a, &tree, .{}));
    }
}

test "direct chart series text reads and edits all ten observed issue6037 names without cache changes" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "reference/rhwp/samples/issue6037", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var names: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
        const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(32_000_000));
        defer a.free(bytes);
        var archive = try @import("../zip/archive.zig").open(a, bytes, .{});
        defer archive.deinit();
        for (archive.entries, 0..) |part, part_index| {
            if (!std.mem.startsWith(u8, part.name, "Chart/") or !std.mem.endsWith(u8, part.name, ".xml")) continue;
            const xml = try archive.decode(part, 16_000_000);
            defer a.free(xml);
            var tree = try @import("chart_tree.zig").parse(a, xml, part_index, .{});
            defer tree.deinit(a);
            var values = try model.collect(a, &tree, .{});
            defer values.deinit(a);
            var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
            defer points.deinit(a);
            for (values.items, 0..) |_, ordinal| {
                const changed = try writer.write(a, &tree, &values, ordinal, "시리즈😀<&", 16_000_000);
                defer a.free(changed);
                var parsed = try @import("chart_tree.zig").parse(a, changed, part_index, .{});
                defer parsed.deinit(a);
                var after_points = try @import("chart_point_values.zig").collect(a, &parsed, .{});
                defer after_points.deinit(a);
                try std.testing.expectEqual(points.points.len, after_points.points.len);
                for (points.points, after_points.points) |before, after| {
                    try std.testing.expectEqual(before.index, after.index);
                    try std.testing.expectEqual(before.kind, after.kind);
                    try std.testing.expectEqualStrings(before.value, after.value);
                }
                try std.testing.expectEqualSlices(u8, xml, tree.source);
                names += 1;
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 10), names);
}
