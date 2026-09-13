const std = @import("std");
const core = @import("hwpjs");
const contents = core.hwp5.chart_observed_contents;
const t = std.testing;
const fixture = @import("chart_fixture");
const layout: contents.Layout = .{ .primary_axis_count = fixture.primary_axis_count, .line_item_count = fixture.line_item_count, .series_point_counts = &fixture.point_counts };
fn decode() ![fixture.bytes.len]u8 {
    var bytes: [fixture.bytes.len]u8 = undefined;
    @memcpy(&bytes, fixture.bytes);
    return bytes;
}
fn exercise(a: std.mem.Allocator) !void {
    var bytes = try decode();
    var value = try contents.readObservedV6(a, &bytes, layout, .{});
    defer value.deinit();
    try t.expectEqual(bytes.len, value.source.len);
    try t.expectEqual(@intFromPtr(&bytes), @intFromPtr(value.source.ptr));
    try t.expectEqualSlices(u8, &bytes, value.source);
    const original_first = bytes[0];
    const replay = try core.hwp5.chart_contents_original.copyOriginal(a, &value, bytes.len);
    defer a.free(replay);
    try t.expectEqualSlices(u8, &bytes, replay);
    const patched = try core.hwp5.chart_contents_patch.applyOriginal(a, &value, &.{}, bytes.len);
    defer a.free(patched);
    try t.expectEqualSlices(u8, &bytes, patched);
    try t.expectEqual(bytes.len, value.end);
    try t.expectEqual(fixture.point_counts.len, value.series.items.len);
    for (value.series.items, layout.series_point_counts) |item, n| try t.expectEqual(n, item.section.points.len);
    const name = value.prefix.legend.font.name.bytes;
    try t.expect(name.len > 0);
    const edited = try core.hwp5.chart_contents_string_edit.replaceStringObject(a, &value, value.prefix.legend.font.name.object_id, "x", 0, bytes.len);
    defer a.free(edited);
    const begin = @intFromPtr(&bytes);
    try t.expect(@intFromPtr(name.ptr) >= begin and @intFromPtr(name.ptr) + name.len <= begin + bytes.len);
    const raw = value.prefix.transition.raw;
    @memset(&bytes, 0xcc);
    try t.expectEqual(@as(u8, 0xcc), value.source[0]);
    try t.expectEqual(original_first, replay[0]);
    try t.expectEqual(@as(u8, 0xcc), name[0]);
    try t.expectEqualSlices(u8, &raw, &value.prefix.transition.raw);
}
test "actual Contents sorted patch splice and extent" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const patches = [_]core.hwp5.chart_contents_patch.Patch{
        .{ .start = 40, .end = 43, .replacement = "AB" },
        .{ .start = 100, .end = 100, .replacement = "xyz" },
        .{ .start = 200, .end = 205, .replacement = "" },
    };
    const out = try core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &patches, bytes.len);
    defer t.allocator.free(out);
    try t.expectEqual(bytes.len - 3, out.len);
    try t.expectEqual(@as(u32, @intCast(out.len - 36)), std.mem.readInt(u32, out[32..36], .little));
    try t.expectEqualSlices(u8, bytes[0..32], out[0..32]);
    try t.expectEqualSlices(u8, "AB", out[40..42]);
    try t.expectEqualSlices(u8, "xyz", out[99..102]);
    try t.expectEqualSlices(u8, bytes[43..100], out[42..99]);
    try t.expectEqualSlices(u8, bytes[205..], out[202..]);
}
test "actual Contents patch validation" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const Patch = core.hwp5.chart_contents_patch.Patch;
    try t.expectError(error.InvalidChartPatchBoundary, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{.{ .start = 50, .end = 49, .replacement = "" }}, bytes.len));
    try t.expectError(error.InvalidChartPatchBoundary, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{.{ .start = bytes.len, .end = bytes.len + 1, .replacement = "" }}, bytes.len));
    try t.expectError(error.OverlappingChartPatches, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{ .{ .start = 50, .end = 60, .replacement = "" }, .{ .start = 59, .end = 70, .replacement = "" } }, bytes.len));
    for ([_]Patch{ .{ .start = 32, .end = 32, .replacement = "x" }, .{ .start = 31, .end = 33, .replacement = "x" }, .{ .start = 35, .end = 37, .replacement = "x" } }) |patch|
        try t.expectError(error.ChartExtentPatchForbidden, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{patch}, bytes.len + 1));
    const after_extent = try core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{.{ .start = 36, .end = 36, .replacement = "x" }}, bytes.len + 1);
    defer t.allocator.free(after_extent);
    try t.expectEqual(@as(u32, @intCast(after_extent.len - 36)), std.mem.readInt(u32, after_extent[32..36], .little));
    try t.expectError(error.LimitExceeded, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{.{ .start = 40, .end = 40, .replacement = "x" }}, bytes.len));
    try t.expectError(error.LimitExceeded, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{ .{ .start = 0, .end = 32, .replacement = "" }, .{ .start = 36, .end = bytes.len, .replacement = "" } }, bytes.len));
    value.end -= 1;
    try t.expectError(error.InvalidChartSourceBoundary, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{}, bytes.len));
    value.end += 1;
    bytes[32] ^= 1;
    try t.expectError(error.InvalidChartSourceExtent, core.hwp5.chart_contents_patch.applyOriginal(t.allocator, &value, &.{}, bytes.len));
}
test "actual Contents String object edit reparses" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const original = value.prefix.legend.font.name;
    try t.expect(value.prefix.legend.font.name_introduced);
    try t.expect(value.prefix.legend.font.name_end > value.prefix.legend.font.name_start + 4);
    try t.expectEqual(original.object_id, std.mem.readInt(u32, bytes[value.prefix.legend.font.name_start..][0..4], .little));
    const same = try core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, original.bytes, original.trailer, bytes.len);
    defer t.allocator.free(same);
    try t.expectEqualSlices(u8, &bytes, same);

    const edited_bytes = "edited-chart-name";
    const max = bytes.len - original.bytes.len + edited_bytes.len;
    const edited = try core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, edited_bytes, 0xa5, max);
    defer t.allocator.free(edited);
    try t.expectEqual(max, edited.len);
    try t.expectEqual(@as(u32, @intCast(edited.len - 36)), std.mem.readInt(u32, edited[32..36], .little));
    var reparsed = try contents.readObservedV6(t.allocator, edited, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.prefix.objects.entries.get(original.object_id).?.string;
    try t.expectEqualSlices(u8, edited_bytes, changed.bytes);
    try t.expectEqual(@as(u8, 0xa5), changed.trailer);
    try t.expectEqual(original.object_id, reparsed.prefix.legend.font.name.object_id);
    try t.expectEqualSlices(u8, edited_bytes, reparsed.prefix.legend.font.name.bytes);

    const alias = value.primary_axes[0].title.font.name;
    try t.expect(!value.primary_axes[0].title.font.name_introduced);
    try t.expectEqual(@as(usize, 4), value.primary_axes[0].title.font.name_end - value.primary_axes[0].title.font.name_start);
    try t.expectEqual(alias.object_id, std.mem.readInt(u32, bytes[value.primary_axes[0].title.font.name_start..][0..4], .little));
    const alias_bytes = "shared-axis-font";
    const alias_max = bytes.len - alias.bytes.len + alias_bytes.len;
    const alias_edited = try core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, alias.object_id, alias_bytes, 0x5a, alias_max);
    defer t.allocator.free(alias_edited);
    var alias_reparsed = try contents.readObservedV6(t.allocator, alias_edited, layout, .{});
    defer alias_reparsed.deinit();
    for (alias_reparsed.primary_axes) |axis| {
        if (axis.title.font.name.object_id == alias.object_id)
            try t.expectEqualSlices(u8, alias_bytes, axis.title.font.name.bytes);
    }

    const empty = try core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, "", 0, bytes.len - original.bytes.len);
    defer t.allocator.free(empty);
    var empty_reparsed = try contents.readObservedV6(t.allocator, empty, layout, .{});
    defer empty_reparsed.deinit();
    try t.expectEqual(@as(usize, 0), empty_reparsed.prefix.legend.font.name.bytes.len);

    const maximum_bytes = try t.allocator.alloc(u8, 65535);
    defer t.allocator.free(maximum_bytes);
    @memset(maximum_bytes, 0xa7);
    const maximum_len = bytes.len - original.bytes.len + maximum_bytes.len;
    const maximum = try core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, maximum_bytes, 0xff, maximum_len);
    defer t.allocator.free(maximum);
    var maximum_reparsed = try contents.readObservedV6(t.allocator, maximum, layout, .{});
    defer maximum_reparsed.deinit();
    try t.expectEqual(@as(usize, 65535), maximum_reparsed.prefix.legend.font.name.bytes.len);
    try t.expectEqual(@as(u8, 0xff), maximum_reparsed.prefix.legend.font.name.trailer);
}
test "actual Contents String edit validation" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const original = value.prefix.legend.font.name;
    try t.expectError(error.UnknownChartStringObject, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, 0xffffffff, "x", 0, bytes.len));
    try t.expectError(error.UnsupportedChartStringEditTarget, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, value.prefix.legend.object_id, "x", 0, bytes.len));
    const too_long = try t.allocator.alloc(u8, 65536);
    defer t.allocator.free(too_long);
    try t.expectError(error.LimitExceeded, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, too_long, 0, std.math.maxInt(usize)));
    const payload_offset = @intFromPtr(original.bytes.ptr) - @intFromPtr(bytes[0..].ptr);
    bytes[payload_offset - 2] ^= 1;
    try t.expectError(error.InvalidChartStringSource, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, "x", 0, bytes.len));
    bytes[payload_offset - 2] ^= 1;
    bytes[payload_offset + original.bytes.len] ^= 1;
    try t.expectError(error.InvalidChartStringSource, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, "x", 0, bytes.len));
    bytes[payload_offset + original.bytes.len] ^= 1;
    const entry = value.prefix.objects.entries.getPtr(original.object_id).?;
    entry.string.object_id ^= 1;
    try t.expectError(error.InvalidChartStringSource, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, "x", 0, bytes.len));
    entry.string.object_id ^= 1;
    entry.string.bytes = "outside-source";
    try t.expectError(error.InvalidChartStringSource, core.hwp5.chart_contents_string_edit.replaceStringObject(t.allocator, &value, original.object_id, "x", 0, bytes.len));
}
test "actual Contents original copy boundaries" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    try t.expectError(error.LimitExceeded, core.hwp5.chart_contents_original.copyOriginal(t.allocator, &value, bytes.len - 1));
    value.end -= 1;
    try t.expectError(error.InvalidChartSourceBoundary, core.hwp5.chart_contents_original.copyOriginal(t.allocator, &value, bytes.len));
}
test "actual Contents success ownership and all allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "actual Contents normal allocator ownership" {
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.expectEqual(.ok, gpa.deinit());
}
fn rejected(a: std.mem.Allocator, bytes: []const u8, options: contents.Options, expected: anyerror) !void {
    var value = contents.readObservedV6(a, bytes, layout, options) catch |err| {
        try t.expectEqual(expected, err);
        return;
    };
    defer value.deinit();
    return error.ExpectedContentsRejection;
}
test "actual Contents every cut and trailing bytes release all allocations" {
    var bytes = try decode();
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    for (0..bytes.len) |cut| {
        if (cut >= 36) std.mem.writeInt(u32, bytes[32..36], @intCast(cut - 36), .little);
        try rejected(gpa.allocator(), bytes[0..cut], .{}, error.UnexpectedEnd);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
    bytes = try decode();
    var extra: [fixture.bytes.len + 1]u8 = @splat(0);
    @memcpy(extra[0..bytes.len], &bytes);
    std.mem.writeInt(u32, extra[32..36], @intCast(extra.len - 36), .little);
    try rejected(gpa.allocator(), &extra, .{}, error.UnexpectedChartTrailingBytes);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.expectEqual(.ok, gpa.deinit());
}
test "actual Contents early and late quota errors release all allocations" {
    const bytes = try decode();
    const options = [_]contents.Options{
        .{ .max_axes = fixture.primary_axis_count - 1 },                               .{ .max_line_items = fixture.line_item_count - 1 },
        .{ .series = .{ .max_series = fixture.point_counts.len - 1 } },                .{ .series = .{ .series = .{ .section = .{ .max_points = fixture.point_counts[0] - 1 } } } },
        .{ .prefix = .{ .grid = .{ .prelude = .{ .types = .{ .max_types = 1 } } } } }, .{ .prefix = .{ .objects = .{ .max_objects = 1 } } },
        .{ .light = .{ .max_sources = 0 } },                                           .{ .axis = .{ .max_string_bytes = 0 } },
        .{ .title = .{ .max_string_bytes = 0 } },
    };
    for (options) |option| {
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        try rejected(gpa.allocator(), &bytes, option, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
        try t.expectEqual(.ok, gpa.deinit());
    }
}
