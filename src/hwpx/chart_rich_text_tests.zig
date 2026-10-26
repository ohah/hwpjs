const std = @import("std");
const model = @import("chart_rich_text_values.zig");
const parse = @import("chart_tree.zig").parse;
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main'>";
const suffix = "</c:chartSpace>";
const writer = @import("chart_rich_text_write.zig");

test "chart rich plain completeness never drops breaks fields empty paragraphs or unknown content" {
    const a = std.testing.allocator;
    const run = "<a:r><a:t>A</a:t></a:r>";
    for ([_]struct { body: []const u8, complete: bool }{
        .{ .body = "<a:bodyPr/><a:lstStyle/><a:p><a:pPr/>" ++ run ++ run ++ "<a:endParaRPr/></a:p><a:p>" ++ run ++ "</a:p>", .complete = true },
        .{ .body = "<a:p>" ++ run ++ "<a:br/>" ++ run ++ "</a:p>", .complete = false },
        .{ .body = "<a:p>" ++ run ++ "<a:fld><a:t>field</a:t></a:fld></a:p>", .complete = false },
        .{ .body = "<a:p>" ++ run ++ "</a:p><a:p/>", .complete = false },
        .{ .body = "<a:p>" ++ run ++ "<a:r/></a:p>", .complete = false },
        .{ .body = "<a:p>" ++ run ++ "</a:p><a:unknown/>", .complete = false },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, "<c:chart><c:title><c:tx><c:rich>", case.body, "</c:rich></c:tx></c:title></c:chart>", suffix });
        defer a.free(source);
        var tree = try parse(a, source, 0, .{});
        defer tree.deinit(a);
        var values = try model.collect(a, &tree, .{});
        defer values.deinit(a);
        try std.testing.expect(values.items.len > 0);
        for (values.items) |value| try std.testing.expectEqual(case.complete, value.plain_text_complete);
        values.items[0].plain_text_complete = !case.complete;
        try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &tree, &values, 0, "new", 10000));
    }
}

test "chart rich owner role classifies source hierarchy and rejects forged bindings" {
    const a = std.testing.allocator;
    const body = "<c:tx><c:rich><a:p><a:r><a:t>title</a:t></a:r></a:p></c:rich></c:tx>";
    const Role = @import("chart_rich_text_owner.zig").Role;
    for ([_]struct { before: []const u8, after: []const u8, role: Role }{
        .{ .before = "<c:chart><c:title>", .after = "</c:title></c:chart>", .role = .chart_title },
        .{ .before = "<c:chart><c:plotArea><c:valAx><c:title>", .after = "</c:title></c:valAx></c:plotArea></c:chart>", .role = .axis_title },
        .{ .before = "<c:chart><c:plotArea><c:ser><c:dLbls><c:dLbl>", .after = "</c:dLbl></c:dLbls></c:ser></c:plotArea></c:chart>", .role = .data_label },
        .{ .before = "<c:title>", .after = "</c:title>", .role = .unclassified },
        .{ .before = "<x:chart xmlns:x='urn:foreign'><c:title>", .after = "</c:title></x:chart>", .role = .unclassified },
        .{ .before = "<c:chart><c:extLst><c:chart><c:title>", .after = "</c:title></c:chart></c:extLst></c:chart>", .role = .unclassified },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.before, body, case.after, suffix });
        defer a.free(source);
        var tree = try parse(a, source, 0, .{});
        defer tree.deinit(a);
        var values = try model.collect(a, &tree, .{});
        defer values.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), values.items.len);
        try std.testing.expectEqual(case.role, values.items[0].owner_role);
        var clone = try values.clone(a);
        defer clone.deinit(a);
        try std.testing.expect(model.sameOwner(values.items[0], clone.items[0]));
        clone.items[0].owner_role = if (case.role == .chart_title) .axis_title else .chart_title;
        try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &tree, &clone, 0, "new", 10000));
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "chart rich text writer preserves formatting comments literal escapes and every failure" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:title><c:tx><c:rich><a:p><a:pPr algn='ctr'/><a:r><a:rPr b='1'/><a:t>A<!--keep--><?hold x?><![CDATA[B]]></a:t></a:r><a:r><a:t>other</a:t></a:r><a:r><a:t/></a:r></a:p></c:rich></c:tx></c:title>" ++ suffix;
    var tree = try parse(a, source, 0, .{});
    defer tree.deinit(a);
    var values = try model.collect(a, &tree, .{});
    defer values.deinit(a);
    const noop = try writer.write(a, &tree, &values, 0, "AB", 10000);
    defer a.free(noop);
    try std.testing.expectEqualStrings(source, noop);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, &values, 0, "AB", source.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, snapshot: *const model.Values) !void {
            const output = try writer.writeEdits(allocator, original, snapshot, &.{
                .{ .ordinal = 0, .text = "_x0041_새😀<&\r" },
                .{ .ordinal = 2, .text = "empty expanded" },
            }, 10000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<a:rPr b='1'/><a:t>_x0041_새😀&lt;&amp;&#13;<!--keep--><?hold x?></a:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<a:t>other</a:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<a:t>empty expanded</a:t>") != null);
            try std.testing.expectEqualStrings("AB", snapshot.items[0].text);
        }
    }.run, .{ &tree, &values });
    try std.testing.expectError(error.InvalidXmlCharacter, writer.write(a, &tree, &values, 0, "\x00", 10000));
    try std.testing.expectError(error.InvalidChartRichTextIndex, writer.write(a, &tree, &values, 3, "bad", 10000));
    try std.testing.expectError(error.DuplicateChartRichTextEdit, writer.writeEdits(a, &tree, &values, &.{ .{ .ordinal = 0, .text = "a" }, .{ .ordinal = 0, .text = "b" } }, 10000));
    values.items[0].run_node = values.items[1].run_node;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &tree, &values, 0, "forged", 10000));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart rich text preserves XML strings run identity and allocation failures" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:title><c:tx><c:rich><a:p><a:r><a:rPr b='1'/><a:t>_x0041_&amp;<![CDATA[😀]]></a:t></a:r><a:r><a:t/></a:r><a:fld><a:t>not editable</a:t></a:fld></a:p></c:rich></c:tx></c:title><a:r><a:t>outside</a:t></a:r>" ++ suffix;
    var tree = try parse(a, source, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree) !void {
            var values = try model.collect(allocator, original, .{});
            defer values.deinit(allocator);
            try values.validateSource(original);
            try std.testing.expectEqual(@as(usize, 2), values.items.len);
            try std.testing.expectEqualStrings("_x0041_&😀", values.items[0].text);
            try std.testing.expectEqualStrings("", values.items[1].text);
            try std.testing.expect(values.items[0].run_node != values.items[1].run_node);
            try std.testing.expectEqual(values.items[0].paragraph_node, values.items[1].paragraph_node);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_values = 0 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_value_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_total_bytes = 1 }));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart rich text rejects duplicate and nested run leaves" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<a:t>A</a:t><a:t>B</a:t>", .err = error.AmbiguousChartRichText },
        .{ .body = "<a:t><a:r/></a:t>", .err = error.InvalidChartRichText },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, "<c:title><c:tx><c:rich><a:p><a:r>", case.body, "</a:r></a:p></c:rich></c:tx></c:title>", suffix });
        defer a.free(source);
        var tree = try parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.err, model.collect(a, &tree, .{}));
    }
}

test "chart rich text reads both observed issue2006 titles without source changes" {
    const a = std.testing.allocator;
    const source = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx", a, .limited(32_000_000));
    defer a.free(source);
    var archive = try @import("../zip/archive.zig").open(a, source, .{});
    defer archive.deinit();
    var count: usize = 0;
    for (archive.entries, 0..) |part, index| {
        if (!std.mem.startsWith(u8, part.name, "Chart/") or !std.mem.endsWith(u8, part.name, ".xml")) continue;
        const xml = try archive.decode(part, 16_000_000);
        defer a.free(xml);
        var tree = try parse(a, xml, index, .{});
        defer tree.deinit(a);
        var values = try model.collect(a, &tree, .{});
        defer values.deinit(a);
        for (values.items, 0..) |value, ordinal| {
            try std.testing.expect(tree.elements[value.owner_node].is(@import("chart_namespace.zig").uri, "title"));
            const expected: []const u8 = if (std.mem.eql(u8, part.name, "Chart/chart1.xml")) "남성" else if (std.mem.eql(u8, part.name, "Chart/chart2.xml")) "여성" else return error.UnexpectedChartTitle;
            try std.testing.expectEqualStrings(expected, value.text);
            try std.testing.expectEqual(@import("chart_rich_text_owner.zig").Role.chart_title, value.owner_role);
            try std.testing.expect(value.plain_text_complete);
            const output = try writer.write(a, &tree, &values, ordinal, "새 제목😀<&_x0041_", 16_000_000);
            defer a.free(output);
            var changed_tree = try parse(a, output, index, .{});
            defer changed_tree.deinit(a);
            var changed = try model.collect(a, &changed_tree, .{});
            defer changed.deinit(a);
            try std.testing.expectEqualStrings("새 제목😀<&_x0041_", changed.items[ordinal].text);
            try std.testing.expectEqual(value.owner_role, changed.items[ordinal].owner_role);
            var before_points = try @import("chart_point_values.zig").collect(a, &tree, .{});
            defer before_points.deinit(a);
            var after_points = try @import("chart_point_values.zig").collect(a, &changed_tree, .{});
            defer after_points.deinit(a);
            try std.testing.expectEqual(before_points.points.len, after_points.points.len);
            for (before_points.points, after_points.points) |before, after| {
                try std.testing.expectEqual(before.kind, after.kind);
                try std.testing.expectEqual(before.index, after.index);
                try std.testing.expectEqualStrings(before.value, after.value);
            }
            count += 1;
        }
        try std.testing.expectEqualStrings(xml, tree.source);
    }
    try std.testing.expectEqual(@as(usize, 2), count);
}

test "chart rich text rejects contradictory text choices and binds exact source" {
    const a = std.testing.allocator;
    const rich = "<c:rich><a:p><a:r><a:t>A</a:t></a:r></a:p></c:rich>";
    for ([_][]const u8{ "<c:strRef/>", "<c:v>B</c:v>", rich }) |other| {
        const source = try std.mem.concat(a, u8, &.{ prefix, "<c:title><c:tx>", rich, other, "</c:tx></c:title>", suffix });
        defer a.free(source);
        var tree = try parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.AmbiguousChartRichText, model.collect(a, &tree, .{}));
    }
    const source = prefix ++ "<c:title><c:tx>" ++ rich ++ "</c:tx></c:title>" ++ suffix;
    var tree = try parse(a, source, 0, .{});
    defer tree.deinit(a);
    var values = try model.collect(a, &tree, .{});
    defer values.deinit(a);
    values.source_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceBindingMismatch, values.validateSource(&tree));
}

test "chart rich text resources clone current runs and combine numeric transient edits" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>original</a:t></a:r></a:p></c:rich></c:tx></c:title><c:ser><c:val><c:numLit><c:ptCount val='1'/><c:pt idx='0'><c:v>1</c:v></c:pt></c:numLit></c:val></c:ser></c:chart>" ++ suffix;
    var tree = try parse(a, source, 0, .{});
    defer tree.deinit(a);
    var rich = try model.collect(a, &tree, .{});
    defer rich.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    const point_xml = try @import("chart_point_write.zig").write(a, &tree, &points, &.{.{ .point = 0, .value = "2" }}, 10000);
    defer a.free(point_xml);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, runs: *const model.Values, cache: *const @import("chart_point_values.zig").Values, transient: []const u8) !void {
            var resources: @import("chart_resource_values.zig").Values = .{};
            defer resources.deinit(allocator);
            try resources.entries.ensureUnusedCapacity(allocator, 1);
            const entry: @import("chart_resource_values.zig").Entry = block: {
                const chart_path = try allocator.dupe(u8, "Chart/test.xml");
                errdefer allocator.free(chart_path);
                const ole_path = try allocator.dupe(u8, "BinData/test.ole");
                errdefer allocator.free(ole_path);
                var owned_points = try cache.clone(allocator);
                errdefer owned_points.deinit(allocator);
                var owned_runs = try runs.clone(allocator);
                errdefer owned_runs.deinit(allocator);
                break :block .{ .chart_path = chart_path, .ole_path = ole_path, .points = owned_points, .rich_text = owned_runs };
            };
            resources.entries.appendAssumeCapacity(entry);
            try verify(allocator, original, &resources, transient);
        }
        fn verify(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, resources: *@import("chart_resource_values.zig").Values, transient: []const u8) !void {
            var copy = try resources.clone(allocator);
            defer copy.deinit(allocator);
            copy.entries.items[0].aliases = try allocator.alloc(@import("chart_resource_values.zig").Alias, 1);
            copy.entries.items[0].aliases[0] = .{ .chart_path = &.{}, .ole_path = &.{} };
            const bytes = try allocator.dupe(u8, "current😀");
            allocator.free(copy.entries.items[0].rich_text.?.items[0].text);
            copy.entries.items[0].rich_text.?.items[0].text = bytes;
            const size = try copy.byteSize(100000);
            try std.testing.expectError(error.LimitExceeded, copy.byteSize(size - 1));
            const output = (try @import("chart_rich_resource_save.zig").apply(allocator, original, &copy.entries.items[0].rich_text.?, transient, 10000)) orelse return error.MissingRichChange;
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<a:t>current😀</a:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<c:v>2</c:v>") != null);
            try std.testing.expectEqualStrings("original", resources.entries.items[0].rich_text.?.items[0].text);
        }
    }.run, .{ &tree, &rich, &points, point_xml });
}
