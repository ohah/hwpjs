const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const cache = @import("chart_cache.zig");

const prefix = "<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\">";
const suffix = "</c:chartSpace>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: cache.Options) !cache.Report {
    var report: cache.Report = .{};
    var scanner: cache.Scanner = .{ .allocator = a, .options = options, .report = &report };
    defer scanner.deinit();
    const Context = struct {
        fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
            const value: *cache.Scanner = @ptrCast(@alignCast(raw));
            try value.onTag(tag, scope, depth);
        }
    };
    _ = try document_xml.visitBytes(a, source, source.len, .{}, .{ .context = &scanner, .on_tag = Context.onTag });
    return report;
}

test "HWPX chart caches count numeric and string points by explicit indices" {
    const source = prefix ++
        "<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val=\"2\"/><c:pt idx=\"0\"><c:v>1.25</c:v></c:pt><c:pt idx=\"1\"><c:v>2</c:v></c:pt></c:numCache>" ++
        "<c:strCache><c:ptCount val=\"2\"/><c:pt idx=\"0\"><c:v>가</c:v></c:pt><c:pt idx=\"1\"><c:v>나</c:v></c:pt></c:strCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.numeric_caches);
    try std.testing.expectEqual(@as(usize, 1), report.string_caches);
    try std.testing.expectEqual(@as(usize, 4), report.points);
    try std.testing.expectEqual(@as(usize, 4), report.declared_points);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX chart caches include literal data with the same point structure" {
    const source = prefix ++
        "<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val=\"1\"/><c:pt idx=\"0\"><c:v>3</c:v></c:pt></c:numLit>" ++
        "<c:strLit><c:ptCount val=\"1\"/><c:pt idx=\"0\"><c:v>표시</c:v></c:pt></c:strLit>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.numeric_literals);
    try std.testing.expectEqual(@as(usize, 1), report.string_literals);
    try std.testing.expectEqual(@as(usize, 2), report.points);
    try std.testing.expectEqual(@as(usize, 2), report.declared_points);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX chart caches report multilevel strings as unsupported coverage" {
    const source = prefix ++ "<c:multiLvlStrCache><c:ptCount val=\"1\"/><c:lvl><c:pt idx=\"0\"><c:v>A</c:v></c:pt></c:lvl><c:numCache/></c:multiLvlStrCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.unsupported_multilevel_string_caches);
    try std.testing.expectEqual(@as(usize, 0), report.points);
    try std.testing.expectEqual(@as(usize, 0), report.numeric_caches);
    try std.testing.expectEqual(@as(usize, 1), report.issues());
}

test "HWPX chart caches retain disagreement, duplicate and out-of-range diagnostics" {
    const source = prefix ++
        "<c:numCache><c:ptCount val=\"4\"/><c:ptCount val=\"5\"/>" ++
        "<c:pt idx=\"0\"><c:v>1</c:v></c:pt><c:pt idx=\"0\"/>" ++
        "<c:pt idx=\"5\"><c:v>2</c:v><c:v>3</c:v></c:pt></c:numCache>" ++
        "<c:strCache><c:pt idx=\"0\"><c:v>A</c:v></c:pt></c:strCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_point_count);
    try std.testing.expectEqual(@as(usize, 1), report.missing_point_count);
    try std.testing.expectEqual(@as(usize, 1), report.point_count_disagreement);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_point_index);
    try std.testing.expectEqual(@as(usize, 1), report.out_of_range_point_index);
    try std.testing.expectEqual(@as(usize, 1), report.missing_value_element);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_value_element);
    try std.testing.expectEqual(@as(usize, 4), report.points);
    try std.testing.expectEqual(@as(usize, 4), report.declared_points);
}

test "HWPX chart caches reject damaged unsigned fields and exact budgets" {
    try std.testing.expectError(error.InvalidChartPointCount, inspect(std.testing.allocator, prefix ++ "<c:numCache><c:ptCount val=\"-1\"/></c:numCache>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidChartPointCount, inspect(std.testing.allocator, prefix ++ "<c:numCache><c:ptCount val=\"4294967296\"/></c:numCache>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidChartPointCount, inspect(std.testing.allocator, prefix ++ "<c:numCache xmlns:x=\"urn:wrong\"><c:ptCount x:val=\"1\"/></c:numCache>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidChartPointIndex, inspect(std.testing.allocator, prefix ++ "<c:strCache><c:ptCount val=\"1\"/><c:pt><c:v>x</c:v></c:pt></c:strCache>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidChartPointIndex, inspect(std.testing.allocator, prefix ++ "<c:strCache xmlns:x=\"urn:wrong\"><c:ptCount val=\"1\"/><c:pt x:idx=\"0\"><c:v>x</c:v></c:pt></c:strCache>" ++ suffix, .{}));
    const source = prefix ++ "<c:numCache><c:ptCount val=\"1\"/><c:pt idx=\"0\"><c:v>1</c:v></c:pt></c:numCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{ .max_data_containers = 1, .max_points = 1, .max_attribute_bytes = 1 });
    try std.testing.expectEqual(@as(usize, 0), report.issues());
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .max_data_containers = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .max_points = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .max_attribute_bytes = 0 }));
}

test "HWPX chart caches collapse surrounding XML whitespace in unsigned fields" {
    const source = prefix ++
        "<c:numCache><c:ptCount val=\" &#x9;1&#xA; \"/><c:pt idx=\"&#xD; 0 &#x9;\"><c:v>1</c:v></c:pt></c:numCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.points);
    try std.testing.expectEqual(@as(usize, 1), report.declared_points);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
    try std.testing.expectError(error.InvalidChartPointCount, inspect(std.testing.allocator, prefix ++ "<c:numCache><c:ptCount val=\"1 2\"/></c:numCache>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidChartPointIndex, inspect(std.testing.allocator, prefix ++ "<c:numCache><c:ptCount val=\"1\"/><c:pt idx=\" \"/></c:numCache>" ++ suffix, .{}));
}

test "HWPX chart caches ignore lookalike namespaces" {
    const source = prefix ++ "<x:numCache xmlns:x=\"urn:other\"><x:ptCount val=\"1\"/><x:pt idx=\"0\"><x:v>x</x:v></x:pt></x:numCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 0), report.caches());
}

test "HWPX chart caches report a nested element inside a value leaf" {
    const source = prefix ++ "<c:numCache><c:ptCount val=\"1\"/><c:pt idx=\"0\"><c:v>1<x:extra xmlns:x=\"urn:other\"/></c:v></c:pt></c:numCache>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.nested_value_element);
    try std.testing.expectEqual(@as(usize, 1), report.issues());
}

test "HWPX chart cache scanner releases index maps on every allocation failure" {
    const source = prefix ++ "<c:numCache><c:ptCount val=\"2\"/><c:pt idx=\"0\"><c:v>1</c:v></c:pt><c:pt idx=\"1\"><c:v>2</c:v></c:pt></c:numCache>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspect(a, bytes, .{});
        }
    }.run, .{source});
}
