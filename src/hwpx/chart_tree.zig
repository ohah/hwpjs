//! Chart root policy only; XML indexing, spans and ownership use the common tree.
const std = @import("std");
const parts = @import("xml_part_tree.zig");
pub const Tree = parts.Tree;
pub const Options = parts.Options;

pub fn parse(a: std.mem.Allocator, bytes: []const u8, item_index: usize, options: Options) !Tree {
    return parts.parse(a, bytes, .chart, null, item_index, options);
}

test "owned chart tree retains exact XML namespaces and source spans under allocation failures" {
    const a = std.testing.allocator;
    const source = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:chart><c:numCache><c:pt idx='0'><c:v>4.30</c:v></c:pt></c:numCache><!--opaque--></c:chart></c:chartSpace>";
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var tree = try parse(allocator, input, 7, .{});
            defer tree.deinit(allocator);
            try std.testing.expectEqualStrings(input, tree.source);
            try std.testing.expectEqualStrings(input, tree.sourceOf(0));
            try std.testing.expect(tree.elements[4].is(@import("chart_namespace.zig").uri, "v"));
            try std.testing.expectEqualStrings("<c:v>4.30</c:v>", tree.sourceOf(4));
            try std.testing.expectEqual(@as(usize, 7), tree.item_index);
            try std.testing.expect(tree.section_ordinal == null);
        }
    }.run, .{source});
    try std.testing.expectError(error.LimitExceeded, parse(a, source, 0, .{ .max_xml_bytes = source.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, parse(a, source, 0, .{ .max_nodes = 4 }));
    try std.testing.expectError(error.InvalidChartRoot, parse(a, "<chartSpace xmlns='urn:foreign'/>", 0, .{}));
    try std.testing.expectError(error.InvalidChartRoot, parse(a, "<c:chart xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'/>", 0, .{}));
    try std.testing.expectError(error.InvalidPartOrdinal, parts.parse(a, source, .chart, 0, 0, .{}));
}

test "owned chart tree reads every reference chart XML without source normalization" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "reference/rhwp/samples/chart", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var charts: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
        const input = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16000000));
        defer a.free(input);
        var archive = try @import("../zip/archive.zig").open(a, input, .{});
        defer archive.deinit();
        var found: usize = 0;
        for (archive.entries, 0..) |part, index| {
            if (!std.mem.startsWith(u8, part.name, "Chart/") or !std.mem.endsWith(u8, part.name, ".xml")) continue;
            const xml = try archive.decode(part, 16000000);
            defer a.free(xml);
            var tree = try parse(a, xml, index, .{});
            defer tree.deinit(a);
            try std.testing.expectEqualSlices(u8, xml, tree.source);
            // Element spans exclude XML declarations; Tree.source retains them.
            try std.testing.expectEqualSlices(u8, xml[tree.elements[0].start_tag.start..tree.elements[0].end], tree.sourceOf(0));
            try std.testing.expect(tree.elements[0].is(@import("chart_namespace.zig").uri, "chartSpace"));
            found += 1;
        }
        try std.testing.expect(found > 0);
        files += 1;
        charts += found;
    }
    try std.testing.expectEqual(@as(usize, 28), files);
    try std.testing.expectEqual(@as(usize, 28), charts);
}
