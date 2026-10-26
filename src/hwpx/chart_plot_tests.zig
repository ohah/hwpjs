const std = @import("std");
const model = @import("chart_plot_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'>";

test "chart plot kinds retain distinct combo owners and exclude foreign nested sources" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:chart><c:plotArea><c:barChart><c:ser/><x:ser/><c:ext><c:ser/></c:ext><c:ser/></c:barChart><c:lineChart><c:ser/></c:lineChart><x:pieChart><c:ser/></x:pieChart></c:plotArea></c:chart><c:ext><c:plotArea><c:pieChart><c:ser/></c:pieChart></c:plotArea></c:ext></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree) !void {
            var values = try model.collect(allocator, original, .{});
            defer values.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), values.plots.len);
            try std.testing.expectEqual(model.Kind.barChart, values.plots[0].kind);
            try std.testing.expectEqual(model.Kind.lineChart, values.plots[1].kind);
            try std.testing.expectEqual(@as(usize, 2), values.plots[0].series_nodes.len);
            try std.testing.expectEqual(@as(usize, 1), values.plots[1].series_nodes.len);
            for (values.plots) |plot| for (plot.series_nodes) |node| {
                try std.testing.expectEqual(@as(?usize, plot.node), original.elements[node].parent);
            };
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_plots = 1 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_series = 2 }));
    try std.testing.expect(model.kind(&tree, tree.elements.len) == null);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart plot kind definitions recognize every official plot without conflating 3D" {
    const a = std.testing.allocator;
    for (std.meta.tags(model.Kind)) |kind| {
        const source = try std.fmt.allocPrint(a, prefix ++ "<c:chart><c:plotArea><c:{s}><c:ser/></c:{s}></c:plotArea></c:chart></c:chartSpace>", .{ @tagName(kind), @tagName(kind) });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        var values = try model.collect(a, &tree, .{});
        defer values.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), values.plots.len);
        try std.testing.expectEqual(kind, values.plots[0].kind);
    }
}

test "chart plot corpus equals independent XML counts across all 28 chart fixtures" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "reference/rhwp/samples/chart", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var counts = @as([std.meta.tags(model.Kind).len]usize, @splat(0));
    var directions = @as([2]usize, @splat(0));
    var groupings = @as([4]usize, @splat(0));
    var vary_colors = @as([2]usize, @splat(0));
    var axis_references: usize = 0;
    var axis_kinds = @as([4]usize, @splat(0));
    var cross_references: usize = 0;
    var scaling_count: usize = 0;
    var orientation_counts = @as([2]usize, @splat(0));
    var explicit_scale_numbers: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
        const input = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(4_000_000));
        defer a.free(input);
        var archive = try @import("../zip/archive.zig").open(a, input, .{});
        defer archive.deinit();
        for (archive.entries, 0..) |part, index| {
            if (!std.mem.startsWith(u8, part.name, "Chart/") or !std.mem.endsWith(u8, part.name, ".xml")) continue;
            const xml = try archive.decode(part, 4_000_000);
            defer a.free(xml);
            var tree = try @import("chart_tree.zig").parse(a, xml, index, .{});
            defer tree.deinit(a);
            var values = try model.collect(a, &tree, .{});
            defer values.deinit(a);
            var definitions = try @import("chart_axis_values.zig").collect(a, &tree, .{});
            defer definitions.deinit(a);
            for (definitions.items) |axis| {
                axis_kinds[@backingInt(axis.kind)] += 1;
                if (axis.scaling) |scaling| {
                    scaling_count += 1;
                    if (scaling.orientation) |field| if (field.value) |value| {
                        orientation_counts[@backingInt(value)] += 1;
                    };
                    for ([_]?@import("chart_scalar_field.zig").Field(@import("chart_scalar_field.zig").Number){ scaling.minimum, scaling.maximum, scaling.log_base }) |field| {
                        if (field != null) explicit_scale_numbers += 1;
                    }
                    try std.testing.expect(scaling.displayIssue() == null);
                }
                if (axis.cross_axis) |cross| {
                    try std.testing.expectEqual(.resolved, definitions.resolve(axis.area_node, cross.value).status);
                    cross_references += 1;
                }
            }
            try std.testing.expectEqual(@as(usize, 1), values.plots.len);
            for (values.plots) |plot| {
                counts[@backingInt(plot.kind)] += 1;
                try std.testing.expect(plot.series_nodes.len > 0);
                var settings = try @import("chart_plot_settings.zig").read(a, &tree, plot.node, .{});
                defer settings.deinit(a);
                if (settings.direction) |field| if (field.value) |value| {
                    directions[@backingInt(value)] += 1;
                };
                if (settings.grouping) |field| if (field.value) |value| {
                    groupings[@backingInt(value)] += 1;
                };
                if (settings.vary_colors) |field| if (field.value) |value| {
                    vary_colors[@intFromBool(value)] += 1;
                };
                axis_references += settings.axis_references.len;
                for (settings.axis_references) |reference| {
                    try std.testing.expectEqual(.resolved, definitions.resolve(plot.area_node, reference.value).status);
                }
            }
            try std.testing.expectEqualStrings(xml, tree.source);
        }
        files += 1;
    }
    try std.testing.expectEqual(@as(usize, 28), files);
    var expected = @as([std.meta.tags(model.Kind).len]usize, @splat(0));
    for ([_]struct { kind: model.Kind, count: usize }{
        .{ .kind = .bar3DChart, .count = 4 },   .{ .kind = .barChart, .count = 7 },
        .{ .kind = .lineChart, .count = 5 },    .{ .kind = .ofPieChart, .count = 2 },
        .{ .kind = .pie3DChart, .count = 1 },   .{ .kind = .pieChart, .count = 2 },
        .{ .kind = .scatterChart, .count = 5 }, .{ .kind = .stockChart, .count = 2 },
    }) |row| expected[@backingInt(row.kind)] = row.count;
    try std.testing.expectEqualSlices(usize, &expected, &counts);
    try std.testing.expectEqualSlices(usize, &.{ 6, 5 }, &directions);
    try std.testing.expectEqualSlices(usize, &.{ 2, 5, 6, 3 }, &groupings);
    try std.testing.expectEqualSlices(usize, &.{ 21, 5 }, &vary_colors);
    try std.testing.expectEqual(@as(usize, 46), axis_references);
    try std.testing.expectEqualSlices(usize, &.{ 18, 28, 0, 0 }, &axis_kinds);
    try std.testing.expectEqual(@as(usize, 46), cross_references);
    try std.testing.expectEqual(@as(usize, 46), scaling_count);
    try std.testing.expectEqualSlices(usize, &.{ 46, 0 }, &orientation_counts);
    try std.testing.expectEqual(@as(usize, 0), explicit_scale_numbers);
}
