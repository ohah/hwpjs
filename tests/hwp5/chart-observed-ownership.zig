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
fn expectTextSpan(source: []const u8, text: ?core.hwp5.chart_value_object.String, introduced: bool, start: usize, end: usize) !void {
    try t.expect(start <= end and end <= source.len);
    if (text) |string| {
        if (introduced) try t.expect(end - start > 4) else try t.expectEqual(@as(usize, 4), end - start);
        try t.expectEqual(string.object_id, std.mem.readInt(u32, source[start..][0..4], .little));
    } else {
        try t.expect(!introduced);
        try t.expectEqual(@as(usize, 4), end - start);
        try t.expectEqual(@as(u32, 0xffffffff), std.mem.readInt(u32, source[start..][0..4], .little));
    }
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
    const forked = try core.hwp5.chart_contents_string_fork.forkFontName(a, &value, &value.primary_axes[0].title.font, 0xfffffffe, "x", 0, bytes.len + 16);
    defer a.free(forked);
    const generic_alias: core.hwp5.chart_object_table.Reference = .{
        .value = value.primary_axes[0].title.font.name,
        .introduced = value.primary_axes[0].title.font.name_introduced,
        .start = value.primary_axes[0].title.font.name_start,
        .end = value.primary_axes[0].title.font.name_end,
    };
    const generic_forked = try core.hwp5.chart_contents_string_fork.forkStringReference(a, &value, &generic_alias, 0xfffffffd, "y", 0, bytes.len + 16);
    defer a.free(generic_forked);
    const value_alias: core.hwp5.chart_object_table.ValueReference = .{
        .value = .{ .string = value.primary_axes[0].title.font.name },
        .introduced = value.primary_axes[0].title.font.name_introduced,
        .start = value.primary_axes[0].title.font.name_start,
        .end = value.primary_axes[0].title.font.name_end,
    };
    const value_forked = try core.hwp5.chart_contents_string_fork.forkStringValueReference(a, &value, &value_alias, 0xfffffffc, "z", 0, bytes.len + 16);
    defer a.free(value_forked);
    const body_forked = try core.hwp5.chart_contents_string_fork.forkTextBodyText(a, &value, &value.series.items[0].section.label.body, 0xfffffffb, "q", 0, bytes.len + 16);
    defer a.free(body_forked);
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
test "actual Contents TextBlock text spans retain wire boundaries" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const footnote = value.prefix.footnote.block;
    try expectTextSpan(&bytes, footnote.text, footnote.text_introduced, footnote.text_start, footnote.text_end);
    for (value.primary_axes) |axis| try expectTextSpan(&bytes, axis.title.text, axis.title.text_introduced, axis.title.text_start, axis.title.text_end);
    try expectTextSpan(&bytes, value.secondary_axis.title.text, value.secondary_axis.title.text_introduced, value.secondary_axis.title.text_start, value.secondary_axis.title.text_end);
    for (value.series.items) |item| {
        for (item.section.points) |point| try expectTextSpan(&bytes, point.label.body.text, point.label.body.text_introduced, point.label.body.text_start, point.label.body.text_end);
        try expectTextSpan(&bytes, item.section.label.body.text, item.section.label.body.text_introduced, item.section.label.body.text_start, item.section.label.body.text_end);
    }
    try expectTextSpan(&bytes, value.title.block.text, value.title.block.text_introduced, value.title.block.text_start, value.title.block.text_end);
}
test "actual Contents TextBlock text adapters fork aliases and reject other states" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.series.items[0].section.label.body;
    try t.expect(target.text != null and !target.text_introduced);
    const old_id = target.text.?.object_id;
    const replacement = "independent-label-body";
    const expected_len = bytes.len + replacement.len + 15;
    const forked = try core.hwp5.chart_contents_string_fork.forkTextBodyText(t.allocator, &value, target, 0xfffffffb, replacement, 0x39, expected_len);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.series.items[0].section.label.body;
    try t.expect(changed.text_introduced);
    try t.expectEqual(@as(u32, 0xfffffffb), changed.text.?.object_id);
    try t.expectEqualSlices(u8, replacement, changed.text.?.bytes);
    try t.expectEqual(@as(u8, 0x39), changed.text.?.trailer);
    try t.expect(reparsed.prefix.objects.entries.contains(old_id));
    try t.expectError(error.UnsupportedChartStringForkTarget, core.hwp5.chart_contents_string_fork.forkTextBlockText(t.allocator, &value, &value.prefix.footnote.block, 0xfffffffa, "x", 0, bytes.len + 16));
    try t.expectError(error.UnsupportedChartStringForkTarget, core.hwp5.chart_contents_string_fork.forkTextBlockText(t.allocator, &value, &value.primary_axes[0].title, 0xfffffffa, "x", 0, bytes.len + 16));
    try t.expectError(error.UnsupportedChartStringForkValue, core.hwp5.chart_contents_string_fork.forkNullableTextBlockText(t.allocator, &value, &value.secondary_axis.title, 0xfffffffa, "x", 0, bytes.len + 16));
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
test "actual Contents Font String alias forks and reparses" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.primary_axes[0].title.font;
    try t.expect(!target.name_introduced);
    const old_id = target.name.object_id;
    const new_id: u32 = 0xfffffffe;
    try t.expect(!value.prefix.objects.entries.contains(new_id));
    const replacement = "independent-axis-font";
    const expected_len = bytes.len + replacement.len + 15;
    const forked = try core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, new_id, replacement, 0x7b, expected_len);
    defer t.allocator.free(forked);
    try t.expectEqual(expected_len, forked.len);
    try t.expectEqual(@as(u32, @intCast(forked.len - 36)), std.mem.readInt(u32, forked[32..36], .little));

    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.primary_axes[0].title.font;
    try t.expect(changed.name_introduced);
    try t.expectEqual(new_id, changed.name.object_id);
    try t.expectEqualSlices(u8, replacement, changed.name.bytes);
    try t.expectEqual(@as(u8, 0x7b), changed.name.trailer);
    try t.expectEqual(new_id, reparsed.prefix.objects.entries.get(new_id).?.string.object_id);
    var retained_old_alias = false;
    for (reparsed.primary_axes[1..]) |axis| {
        if (axis.title.font.name.object_id == old_id) retained_old_alias = true;
    }
    try t.expect(retained_old_alias);
}
test "actual Contents generic String alias forks and reparses" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const font = value.primary_axes[0].title.font;
    const target: core.hwp5.chart_object_table.Reference = .{ .value = font.name, .introduced = font.name_introduced, .start = font.name_start, .end = font.name_end };
    try t.expectEqual(@as(usize, 4), target.end - target.start);
    const old_id = target.value.object_id;
    const new_id: u32 = 0xfffffffd;
    const replacement = "generic-reference-name";
    const expected_len = bytes.len + replacement.len + 15;
    const forked = try core.hwp5.chart_contents_string_fork.forkStringReference(t.allocator, &value, &target, new_id, replacement, 0x6c, expected_len);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.primary_axes[0].title.font;
    try t.expect(changed.name_introduced);
    try t.expectEqual(new_id, changed.name.object_id);
    try t.expectEqualSlices(u8, replacement, changed.name.bytes);
    try t.expectEqual(@as(u8, 0x6c), changed.name.trailer);
    try t.expect(reparsed.prefix.objects.entries.contains(old_id));
    try t.expectEqual(@as(u32, @intCast(forked.len - 36)), std.mem.readInt(u32, forked[32..36], .little));
    try t.expectError(error.UnsupportedChartStringForkTarget, core.hwp5.chart_contents_string_fork.forkStringReference(t.allocator, &value, &value.series.items[0].section.text, 0xfffffffc, "x", 0, bytes.len + 16));
}
test "actual Contents Font String fork validation" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.primary_axes[0].title.font;
    try t.expectError(error.UnsupportedChartStringForkTarget, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, &value.prefix.legend.font, 0xfffffffe, "x", 0, bytes.len + 16));
    try t.expectError(error.UnsupportedChartObjectReference, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, 0xffffffff, "x", 0, bytes.len + 16));
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, target.name.object_id, "x", 0, bytes.len + 16));
    const too_long = try t.allocator.alloc(u8, 65536);
    defer t.allocator.free(too_long);
    try t.expectError(error.LimitExceeded, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, 0xfffffffe, too_long, 0, std.math.maxInt(usize)));
    var bad_span = target.*;
    bad_span.name_end -= 1;
    try t.expectError(error.InvalidChartStringReferenceSpan, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, &bad_span, 0xfffffffe, "x", 0, bytes.len + 16));
    bytes[target.name_start] ^= 1;
    try t.expectError(error.InvalidChartStringReferenceSpan, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, 0xfffffffe, "x", 0, bytes.len + 16));
    bytes[target.name_start] ^= 1;
    const original_entry = value.prefix.objects.entries.getPtr(target.name.object_id).?;
    original_entry.string.object_id ^= 1;
    try t.expectError(error.InvalidChartStringReferenceSpan, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, 0xfffffffe, "x", 0, bytes.len + 16));
    original_entry.string.object_id ^= 1;
    const string_type = value.prefix.grid.prelude.types.findLowestId("VtString\x00", 1).?;
    value.prefix.grid.prelude.types.definitions.getPtr(string_type).?.version = 2;
    try t.expectError(error.MissingChartStringForkType, core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, 0xfffffffe, "x", 0, bytes.len + 16));
}
test "actual Contents String ValueReference forks and rejects Number" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const font = value.primary_axes[0].title.font;
    const target: core.hwp5.chart_object_table.ValueReference = .{ .value = .{ .string = font.name }, .introduced = font.name_introduced, .start = font.name_start, .end = font.name_end };
    const replacement = "value-reference-name";
    const expected_len = bytes.len + replacement.len + 15;
    const forked = try core.hwp5.chart_contents_string_fork.forkStringValueReference(t.allocator, &value, &target, 0xfffffffc, replacement, 0x4d, expected_len);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(@as(u32, 0xfffffffc), reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.primary_axes[0].title.font.name.bytes);
    try t.expectEqual(@as(u8, 0x4d), reparsed.primary_axes[0].title.font.name.trailer);

    var number_reference: ?*const core.hwp5.chart_object_table.ValueReference = null;
    for (value.primary_axes) |*axis| {
        if (axis.scale) |*scale| {
            if (scale.value.reference) |*reference| switch (reference.value) {
                .number => {
                    number_reference = reference;
                    break;
                },
                .string => {},
            };
        }
    }
    try t.expectError(error.UnsupportedChartStringForkValue, core.hwp5.chart_contents_string_fork.forkStringValueReference(t.allocator, &value, number_reference orelse return error.MissingFixtureNumberValueReference, 0xfffffffb, "x", 0, bytes.len + 16));
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
