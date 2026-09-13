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
fn expectRequiredFormatCodeSpan(source: []const u8, format: core.hwp5.chart_text_format.Format) !void {
    try t.expect(format.code_start <= format.code_end and format.code_end <= source.len);
    if (format.code_introduced) try t.expect(format.code_end - format.code_start > 4) else try t.expectEqual(@as(usize, 4), format.code_end - format.code_start);
    try t.expectEqual(format.code.object_id, std.mem.readInt(u32, source[format.code_start..][0..4], .little));
}
fn expectNullableFormatCodeSpan(source: []const u8, format: core.hwp5.chart_text_format.NullableFormat) !void {
    try t.expect(format.code_start <= format.code_end and format.code_end <= source.len);
    if (format.code) |string| {
        if (format.code_introduced) try t.expect(format.code_end - format.code_start > 4) else try t.expectEqual(@as(usize, 4), format.code_end - format.code_start);
        try t.expectEqual(string.object_id, std.mem.readInt(u32, source[format.code_start..][0..4], .little));
    } else {
        try t.expect(!format.code_introduced);
        try t.expectEqual(@as(usize, 4), format.code_end - format.code_start);
        try t.expectEqual(@as(u32, 0xffffffff), std.mem.readInt(u32, source[format.code_start..][0..4], .little));
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
    const shared_inline_reference: core.hwp5.chart_object_table.Reference = .{ .value = value.prefix.footnote.block.font.name, .introduced = value.prefix.footnote.block.font.name_introduced, .start = value.prefix.footnote.block.font.name_start, .end = value.prefix.footnote.block.font.name_end };
    const shared_inline_forked = try core.hwp5.chart_contents_inline_fork.forkIntroduced(a, &value, &shared_inline_reference, 0xffffffee, "i", 9, bytes.len + 128);
    defer a.free(shared_inline_forked);
    const number_replacement = try core.hwp5.chart_contents_number_edit.replacement(a, &value, &value.primary_axes[1].scale.?.value.reference.?, 1, 2);
    defer a.free(number_replacement);
    const null_grid_cell = try core.hwp5.chart_grid_null_target.resolve(&value, 0, 0);
    const grid_materialized = try core.hwp5.chart_grid_string_materialize.replacement(a, &value, null_grid_cell, 0xffffffe0, 0xffffffe1, 0xffffffe2, "n", 3);
    defer a.free(grid_materialized);
    const shared_mixed_forked = try core.hwp5.chart_contents_string_fork.forkMany(a, &value, &.{ .{ .inline_string = .{ .reference = shared_inline_reference, .new_object_id = 0xffffffed, .bytes = "j", .trailer = 10 } }, .{ .font_name = .{ .font = &value.primary_axes[0].title.font, .new_object_id = 0xffffffec, .bytes = "k", .trailer = 11 } } }, bytes.len + 160);
    defer a.free(shared_mixed_forked);
    const inline_reference: core.hwp5.chart_object_table.Reference = .{ .value = value.title.block.text.?, .introduced = value.title.block.text_introduced, .start = value.title.block.text_start, .end = value.title.block.text_end };
    const batch_forked = try core.hwp5.chart_contents_string_fork.forkMany(a, &value, &.{ .{ .inline_string = .{ .reference = inline_reference, .new_object_id = 0xffffffef, .bytes = "h", .trailer = 8 } }, .{ .null_text_format_object = .{ .block = &value.primary_axes[0].scale.?.value, .format_object_id = 0xfffffff1, .code_object_id = 0xfffffff2, .format_type_id = 0xfffffff0, .raw_word = 7, .bytes = "g", .trailer = 7 } }, .{ .null_nullable_text_format = .{ .format = &value.series.items[0].suffix.formats[0], .new_object_id = 0xfffffff3, .bytes = "f", .trailer = 6 } }, .{ .null_nullable_text_block = .{ .block = &value.secondary_axis.title, .new_object_id = 0xfffffff4, .bytes = "e", .trailer = 5 } }, .{ .nullable_text_block = .{ .block = &value.series.items[0].suffix.block, .new_object_id = 0xfffffff5, .bytes = "d", .trailer = 4 } }, .{ .null_text_body = .{ .body = &value.series.items[0].section.points[0].label.body, .new_object_id = 0xfffffff6, .bytes = "c", .trailer = 3 } }, .{ .text_body = .{ .body = &value.series.items[0].section.label.body, .new_object_id = 0xfffffff8, .bytes = "b", .trailer = 2 } }, .{ .font_name = .{ .font = &value.primary_axes[0].title.font, .new_object_id = 0xfffffff7, .bytes = "a", .trailer = 1 } } }, bytes.len + 256);
    defer a.free(batch_forked);
    const font = value.primary_axes[0].title.font;
    const format_alias: core.hwp5.chart_text_format.Format = .{ .object_id = font.object_id, .raw_word = 0, .code = font.name, .code_introduced = font.name_introduced, .code_start = font.name_start, .code_end = font.name_end, .end = font.name_end };
    const format_forked = try core.hwp5.chart_contents_string_fork.forkTextFormatCode(a, &value, &format_alias, 0xfffffff9, "f", 0, bytes.len + 16);
    defer a.free(format_forked);
    const begin = @intFromPtr(&bytes);
    try t.expect(@intFromPtr(name.ptr) >= begin and @intFromPtr(name.ptr) + name.len <= begin + bytes.len);
    const raw = value.prefix.transition.raw;
    @memset(&bytes, 0xcc);
    try t.expectEqual(@as(u8, 0xcc), value.source[0]);
    try t.expectEqual(original_first, replay[0]);
    try t.expectEqual(@as(u8, 0xcc), name[0]);
    try t.expectEqualSlices(u8, &raw, &value.prefix.transition.raw);
}

fn exerciseMultiChartSession(a: std.mem.Allocator, outer: []const u8, options: core.hwp5.chart_edit_session.Options) !void {
    const commands = [_]core.hwp5.chart_edit_session.ChartCommand{ .{ .ordinal = 1, .ole_layout = .raw_cfb, .chart_layout = layout, .edits = &.{.{ .primary_axis_title_font_name = .{ .axis_index = 0, .bytes = "outer-saved-axis-font", .trailer = 0x55 } }} }, .{ .ordinal = 2, .ole_layout = .raw_cfb, .chart_layout = layout, .edits = &.{.{ .series_label_body_text = .{ .series_index = 0, .bytes = "outer-series-label", .trailer = 0x66 } }} } };
    const output = try core.hwp5.chart_edit_session.applyCharts(a, outer, &commands, .observed_optional_extension, options);
    defer a.free(output);
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
test "actual Contents TextFormat code spans retain wire boundaries" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    for (value.primary_axes) |axis| {
        if (axis.scale) |scale| if (scale.value.format) |format| try expectRequiredFormatCodeSpan(&bytes, format);
    }
    for (value.series.items) |item| for (item.suffix.formats) |format| try expectNullableFormatCodeSpan(&bytes, format);
}
test "actual chart string reference inventory remains explicit" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    var fonts = [_]usize{ 0, 0 }; // alias, inline
    var texts = [_]usize{ 0, 0, 0 }; // null, alias, inline
    var missing_formats: usize = 0;
    var format_codes = [_]usize{ 0, 0, 0 }; // null, alias, inline
    const Count = struct {
        fn font(introduced: bool, counts: *[2]usize) void {
            counts[@intFromBool(introduced)] += 1;
        }
        fn text(is_null: bool, introduced: bool, counts: *[3]usize) void {
            counts[if (is_null) 0 else if (introduced) 2 else 1] += 1;
        }
    };
    Count.font(value.prefix.footnote.block.font.name_introduced, &fonts);
    Count.font(value.prefix.legend.font.name_introduced, &fonts);
    Count.font(value.secondary_axis.title.font.name_introduced, &fonts);
    Count.font(value.title.block.font.name_introduced, &fonts);
    Count.text(false, value.prefix.footnote.block.text_introduced, &texts);
    Count.text(value.secondary_axis.title.text == null, value.secondary_axis.title.text_introduced, &texts);
    Count.text(value.title.block.text == null, value.title.block.text_introduced, &texts);
    for (value.primary_axes) |axis| {
        Count.font(axis.title.font.name_introduced, &fonts);
        Count.text(false, axis.title.text_introduced, &texts);
        if (axis.scale) |scale| {
            if (scale.value.format == null) missing_formats += 1;
        }
    }
    for (value.series.items) |series| {
        Count.font(series.section.label.body.font.name_introduced, &fonts);
        Count.text(series.section.label.body.text == null, series.section.label.body.text_introduced, &texts);
        Count.font(series.suffix.block.font.name_introduced, &fonts);
        Count.text(series.suffix.block.text == null, series.suffix.block.text_introduced, &texts);
        for (series.suffix.formats) |format| Count.text(format.code == null, format.code_introduced, &format_codes);
        for (series.section.points) |point| {
            Count.font(point.label.body.font.name_introduced, &fonts);
            Count.text(point.label.body.text == null, point.label.body.text_introduced, &texts);
        }
    }
    try t.expectEqualSlices(usize, &.{ 23, 3 }, &fonts);
    try t.expectEqualSlices(usize, &.{ 13, 6, 6 }, &texts);
    try t.expectEqual(@as(usize, 3), missing_formats);
    try t.expectEqualSlices(usize, &.{ 6, 0, 0 }, &format_codes);
    var number_count: usize = 0;
    for (value.primary_axes, 0..) |axis, axis_index| if (axis.scale) |scale| if (scale.value.reference) |reference| switch (reference.value) {
        .number => |number| {
            try t.expect(axis_index == 1 or axis_index == 2);
            try t.expect(reference.introduced);
            var refs: usize = 0;
            for (value.prefix.objects.references.items) |item| refs += @intFromBool(item.object_id == number.object_id);
            try t.expectEqual(@as(usize, 1), refs);
            try t.expectEqual(@as(usize, 10), number.payload_end - number.payload_start);
            try t.expectEqual(number.bits, std.mem.readInt(u64, bytes[number.payload_start..][0..8], .little));
            try t.expectEqual(number.trailer, std.mem.readInt(u16, bytes[number.payload_start + 8 ..][0..2], .little));
            number_count += 1;
        },
        else => {},
    };
    try t.expectEqual(@as(usize, 2), number_count);
    const ReferenceCount = struct {
        fn of(objects: *const core.hwp5.chart_object_table.Table, object_id: u32) usize {
            var count: usize = 0;
            for (objects.references.items) |reference| if (reference.object_id == object_id) {
                count += 1;
            };
            return count;
        }
    };
    try t.expectEqual(@as(usize, 22), ReferenceCount.of(&value.prefix.objects, value.prefix.footnote.block.font.name.object_id));
    try t.expectEqual(@as(usize, 4), ReferenceCount.of(&value.prefix.objects, value.prefix.legend.font.name.object_id));
    for ([_]u32{ value.title.block.font.name.object_id, value.prefix.footnote.block.text.object_id, value.primary_axes[0].title.text.object_id, value.primary_axes[1].title.text.object_id, value.primary_axes[2].title.text.object_id, value.primary_axes[3].title.text.object_id, value.title.block.text.?.object_id }) |object_id|
        try t.expectEqual(@as(usize, 1), ReferenceCount.of(&value.prefix.objects, object_id));
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
test "actual null point label materializes as an inline String" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const body = &value.series.items[0].section.points[0].label.body;
    try t.expect(body.text == null);
    try t.expectEqual(@as(usize, 4), body.text_end - body.text_start);
    const new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{});
    const replacement = "materialized-point";
    const forked = try core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .null_text_body = .{ .body = body, .new_object_id = new_id, .bytes = replacement, .trailer = 0x48 } }}, bytes.len + replacement.len + 15);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.series.items[0].section.points[0].label.body;
    try t.expect(changed.text_introduced);
    try t.expectEqual(new_id, changed.text.?.object_id);
    try t.expectEqualSlices(u8, replacement, changed.text.?.bytes);
    try t.expectEqual(@as(u8, 0x48), changed.text.?.trailer);
    try t.expectError(error.ExpectedNullChartString, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .null_text_body = .{ .body = &value.series.items[0].section.label.body, .new_object_id = 0xfffffffa, .bytes = "x", .trailer = 0 } }}, bytes.len + 16));
    try t.expectError(error.ExpectedNullChartString, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .null_nullable_text_block = .{ .block = &value.series.items[0].suffix.block, .new_object_id = 0xfffffff9, .bytes = "x", .trailer = 0 } }}, bytes.len + 16));
    try t.expectError(error.UnsupportedChartStringForkValue, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .nullable_text_block = .{ .block = &value.secondary_axis.title, .new_object_id = 0xfffffff9, .bytes = "x", .trailer = 0 } }}, bytes.len + 16));
    bytes[body.text_start] = 0;
    try t.expectError(error.InvalidChartStringReferenceSpan, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .null_text_body = .{ .body = body, .new_object_id = 0xfffffffa, .bytes = "x", .trailer = 0 } }}, bytes.len + 16));
}
test "TextFormat adapters map actual source spans to the shared String fork" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();

    // The fixed corpus has no TextFormat code alias. Wrap an actual Font alias
    // span to test only the adapter-to-writer mapping against real source bytes.
    const font = value.primary_axes[0].title.font;
    const target: core.hwp5.chart_text_format.Format = .{ .object_id = font.object_id, .raw_word = 0, .code = font.name, .code_introduced = font.name_introduced, .code_start = font.name_start, .code_end = font.name_end, .end = font.name_end };
    try t.expect(!target.code_introduced);
    const replacement = "format-adapter-code";
    const expected_len = bytes.len + replacement.len + 15;
    const forked = try core.hwp5.chart_contents_string_fork.forkTextFormatCode(t.allocator, &value, &target, 0xfffffff9, replacement, 0x2a, expected_len);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(@as(u32, 0xfffffff9), reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.primary_axes[0].title.font.name.bytes);
    try t.expectEqual(@as(u8, 0x2a), reparsed.primary_axes[0].title.font.name.trailer);

    const nullable = &value.series.items[0].suffix.formats[0];
    try t.expect(nullable.code == null);
    try t.expectError(error.UnsupportedChartStringForkValue, core.hwp5.chart_contents_string_fork.forkNullableTextFormatCode(t.allocator, &value, nullable, 0xfffffff8, "x", 0, bytes.len + 16));

    const inline_reference = value.series.items[0].section.text;
    const introduced: core.hwp5.chart_text_format.Format = .{ .object_id = font.object_id, .raw_word = 0, .code = inline_reference.value, .code_introduced = inline_reference.introduced, .code_start = inline_reference.start, .code_end = inline_reference.end, .end = inline_reference.end };
    try t.expect(introduced.code_introduced);
    try t.expectError(error.UnsupportedChartStringForkTarget, core.hwp5.chart_contents_string_fork.forkTextFormatCode(t.allocator, &value, &introduced, 0xfffffff8, "x", 0, bytes.len + 16));
}
test "actual Contents allocates and forks with the lowest available object ID" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.primary_axes[0].title.font;
    const new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{target.object_id});
    try t.expect(new_id != 0xffffffff);
    try t.expect(new_id != target.object_id);
    try t.expect(!value.prefix.objects.entries.contains(new_id));
    const replacement = "allocated-axis-font";
    const forked = try core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, new_id, replacement, 0x31, bytes.len + replacement.len + 15);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(new_id, reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.primary_axes[0].title.font.name.bytes);
}
test "actual edited Contents survives inner OLE CFB stream replacement" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.primary_axes[0].title.font;
    const new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{target.object_id});
    const replacement = "saved-axis-font";
    const forked = try core.hwp5.chart_contents_string_fork.forkFontName(t.allocator, &value, target, new_id, replacement, 0x44, bytes.len + replacement.len + 15);
    defer t.allocator.free(forked);

    const inner = try core.cfb.writer.write(t.allocator, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "Contents", .parent = 0, .content = &bytes }, .{ .name = "Unknown", .parent = 0, .content = "preserved" } }, .{});
    defer t.allocator.free(inner);
    const saved = try core.hwp5.ole_stream_replace.replaceExact(t.allocator, inner, .raw_cfb, "/Contents", forked, .{ .max_output_bytes = inner.len + forked.len });
    defer t.allocator.free(saved);
    var file = try core.cfb.File.open(t.allocator, saved, .{ .strict = true });
    defer file.deinit();
    try t.expectEqualStrings("preserved", file.entries[(try file.findExact("/Unknown")).?].content);
    const stored = file.entries[(try file.findExact("/Contents")).?].content;
    var reparsed = try contents.readObservedV6(t.allocator, stored, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(new_id, reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.primary_axes[0].title.font.name.bytes);
    try t.expectEqual(@as(u8, 0x44), reparsed.primary_axes[0].title.font.name.trailer);
}
test "actual edited Contents survives compressed outer HWP BinData replacement" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const target = &value.primary_axes[0].title.font;
    const new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{target.object_id});
    const replacement = "outer-saved-axis-font";
    const series_new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{});
    const series_replacement = "outer-series-label";
    const batch_axis_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{target.object_id});
    const batch_point_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{ target.object_id, batch_axis_id });
    const batch_series_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{ target.object_id, batch_axis_id, batch_point_id });
    const point_replacement = "outer-point-label";

    const inner = try core.cfb.writer.write(t.allocator, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "Contents", .parent = 0, .content = &bytes }, .{ .name = "Unknown", .parent = 0, .content = "inner-preserved" } }, .{ .version = 4 });
    defer t.allocator.free(inner);
    const stored_inner = try core.raw_deflate.encodeStored(t.allocator, inner, inner.len + 16);
    defer t.allocator.free(stored_inner);

    var header = [_]u8{0} ** 256;
    @memcpy(header[0..17], "HWP Document File");
    std.mem.writeInt(u32, header[32..36], 0x05000107, .little);
    std.mem.writeInt(u32, header[36..40], 1, .little);
    var doc_info = [_]u8{0} ** 96;
    std.mem.writeInt(u32, doc_info[0..4], 17 | (60 << 20), .little);
    std.mem.writeInt(i32, doc_info[4..8], 2, .little);
    std.mem.writeInt(u32, doc_info[64..68], 18 | (1 << 10) | (12 << 20), .little);
    @memcpy(doc_info[68..80], &[_]u8{ 2, 0, 1, 0, 3, 0, 'O', 0, 'L', 0, 'E', 0 });
    std.mem.writeInt(u32, doc_info[80..84], 18 | (1 << 10) | (12 << 20), .little);
    @memcpy(doc_info[84..96], &[_]u8{ 2, 0, 2, 0, 3, 0, 'O', 0, 'L', 0, 'E', 0 });
    const stored_doc_info = try core.raw_deflate.encodeStored(t.allocator, &doc_info, 112);
    defer t.allocator.free(stored_doc_info);
    const outer = try core.cfb.writer.write(t.allocator, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = stored_doc_info },
        .{ .name = "BinData", .kind = 1, .parent = 0 },
        .{ .name = "BIN0001.OLE", .parent = 3, .content = stored_inner },
        .{ .name = "BIN0002.OLE", .parent = 3, .content = stored_inner },
        .{ .name = "Sibling", .parent = 0, .content = "outer-preserved" },
    }, .{ .version = 3 });
    defer t.allocator.free(outer);
    const item: core.hwp5.docinfo.BinData = .{ .attributes = 2, .data = .{ .storage = 1 }, .extra = &.{ 3, 0, 'O', 0, 'L', 0, 'E', 0 } };
    const edit_options: core.hwp5.chart_edit_session.Options = .{ .file = .{ .bin_data = .{ .max_doc_info_bytes = 96, .max_encoded_bytes = 64 * 1024, .max_total_encoded_bytes = 64 * 1024, .max_output_bytes = 128 * 1024 }, .ole = .{ .max_output_bytes = 64 * 1024 }, .max_decoded_bin_data_bytes = 64 * 1024, .max_total_decoded_bin_data_bytes = 64 * 1024, .max_total_edited_ole_bytes = 64 * 1024 }, .max_contents_bytes = bytes.len, .max_edited_contents_bytes = bytes.len + replacement.len + 15 };
    try t.expectError(error.InvalidChartAxisIndex, core.hwp5.chart_edit_session.forkPrimaryAxisTitleFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.primary_axis_count, replacement, 0x55, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.forkSeriesLabelBodyText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, series_replacement, 0x66, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.forkSeriesLabelFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, "x", 0, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.forkSeriesSuffixFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, "x", 0, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.forkSeriesSuffixText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, "x", 0, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.materializeSeriesSuffixFormatCode(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, 0, "x", 0, edit_options));
    try t.expectError(error.InvalidChartFormatIndex, core.hwp5.chart_edit_session.materializeSeriesSuffixFormatCode(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, 2, "x", 0, edit_options));
    try t.expectError(error.InvalidChartAxisIndex, core.hwp5.chart_edit_session.materializePrimaryAxisScaleFormat(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.primary_axis_count, 0, "x", 0, edit_options));
    try t.expectError(error.MissingChartAxisScale, core.hwp5.chart_edit_session.materializePrimaryAxisScaleFormat(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 3, 0, "x", 0, edit_options));
    try t.expectError(error.InvalidChartAxisIndex, core.hwp5.chart_edit_session.forkInlinePrimaryAxisTitleText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.primary_axis_count, "x", 0, edit_options));
    try t.expectError(error.InvalidChartAxisIndex, core.hwp5.chart_edit_session.replacePrimaryAxisScaleNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.primary_axis_count, 0, 0, edit_options));
    try t.expectError(error.MissingChartAxisScale, core.hwp5.chart_edit_session.replacePrimaryAxisScaleNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 3, 0, 0, edit_options));
    try t.expectError(error.InvalidChartGridRow, core.hwp5.chart_edit_session.replaceGridCellNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, value.prefix.grid.prelude.rows, 0, 0, 0, edit_options));
    try t.expectError(error.InvalidChartGridColumn, core.hwp5.chart_edit_session.replaceGridCellNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, value.prefix.grid.prelude.columns, 0, 0, edit_options));
    try t.expectError(error.ExpectedChartNumber, core.hwp5.chart_edit_session.replaceGridCellNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, 0, 0, 0, edit_options));
    try t.expectError(error.InvalidChartGridRow, core.hwp5.chart_edit_session.replaceGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, value.prefix.grid.prelude.rows, 0, "x", 0, edit_options));
    try t.expectError(error.InvalidChartGridColumn, core.hwp5.chart_edit_session.replaceGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, value.prefix.grid.prelude.columns, "x", 0, edit_options));
    try t.expectError(error.ExpectedChartString, core.hwp5.chart_edit_session.replaceGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 1, 1, "x", 0, edit_options));
    try t.expectError(error.InvalidChartGridRow, core.hwp5.chart_edit_session.materializeGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, value.prefix.grid.prelude.rows, 0, "x", 0, edit_options));
    try t.expectError(error.InvalidChartGridColumn, core.hwp5.chart_edit_session.materializeGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, value.prefix.grid.prelude.columns, "x", 0, edit_options));
    try t.expectError(error.ExpectedNullChartCell, core.hwp5.chart_edit_session.materializeGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, 1, "x", 0, edit_options));
    try t.expectError(error.InvalidChartPointIndex, core.hwp5.chart_edit_session.forkSeriesPointLabelFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, value.series.items[0].section.points.len, "x", 0, edit_options));
    try t.expectError(error.InvalidChartSeriesIndex, core.hwp5.chart_edit_session.materializeSeriesPointLabelBodyText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, layout.series_point_counts.len, 0, point_replacement, 0x77, edit_options));
    try t.expectError(error.InvalidChartPointIndex, core.hwp5.chart_edit_session.materializeSeriesPointLabelBodyText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, value.series.items[0].section.points.len, point_replacement, 0x77, edit_options));
    var low_source = edit_options;
    low_source.max_contents_bytes = bytes.len - 1;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.forkPrimaryAxisTitleFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, replacement, 0x55, low_source));
    var low_output = edit_options;
    low_output.max_edited_contents_bytes = bytes.len;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.forkPrimaryAxisTitleFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, replacement, 0x55, low_output));
    try t.expectError(error.InvalidOleEnvelopeSize, core.hwp5.chart_edit_session.forkPrimaryAxisTitleFontName(t.allocator, outer, 1, .observed_optional_extension, .observed_size_prefix, layout, 0, replacement, 0x55, edit_options));
    try t.expectError(error.EmptyChartEditBatch, core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &.{}, edit_options));
    var one_edit_only = edit_options;
    one_edit_only.max_edits = 1;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &.{ .{ .primary_axis_title_font_name = .{ .axis_index = 0, .bytes = replacement, .trailer = 0x55 } }, .{ .series_label_body_text = .{ .series_index = 0, .bytes = series_replacement, .trailer = 0x66 } } }, one_edit_only));
    const saved_outer = try core.hwp5.chart_edit_session.forkPrimaryAxisTitleFontName(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, replacement, 0x55, edit_options);
    defer t.allocator.free(saved_outer);

    var outer_file = try core.cfb.File.open(t.allocator, saved_outer, .{ .strict = true });
    defer outer_file.deinit();
    try t.expectEqual(@as(u16, 3), outer_file.header.major);
    try t.expectEqualStrings("outer-preserved", outer_file.entries[(try outer_file.findExact("/Sibling")).?].content);
    try t.expectEqualSlices(u8, stored_inner, outer_file.entries[(try outer_file.findExact("/BinData/BIN0002.OLE")).?].content);
    const parsed_header = try core.hwp5.Header.parse(outer_file.entries[(try outer_file.findExact("/FileHeader")).?].content);
    const stored = outer_file.entries[(try outer_file.findExact("/BinData/BIN0001.OLE")).?].content;
    try t.expect(parsed_header.has(.compressed));
    try t.expect(!std.mem.eql(u8, stored, inner));
    const decoded_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &parsed_header, item, stored, 64 * 1024);
    defer t.allocator.free(decoded_inner);
    var inner_file = try core.cfb.File.open(t.allocator, decoded_inner, .{ .strict = true });
    defer inner_file.deinit();
    try t.expectEqual(@as(u16, 4), inner_file.header.major);
    try t.expectEqualStrings("inner-preserved", inner_file.entries[(try inner_file.findExact("/Unknown")).?].content);
    var reparsed = try contents.readObservedV6(t.allocator, inner_file.entries[(try inner_file.findExact("/Contents")).?].content, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(new_id, reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.primary_axes[0].title.font.name.bytes);
    try t.expectEqual(@as(u8, 0x55), reparsed.primary_axes[0].title.font.name.trailer);

    const series_saved_outer = try core.hwp5.chart_edit_session.forkSeriesLabelBodyText(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, series_replacement, 0x66, edit_options);
    defer t.allocator.free(series_saved_outer);
    var series_outer_file = try core.cfb.File.open(t.allocator, series_saved_outer, .{ .strict = true });
    defer series_outer_file.deinit();
    const series_header = try core.hwp5.Header.parse(series_outer_file.entries[(try series_outer_file.findExact("/FileHeader")).?].content);
    const series_stored = series_outer_file.entries[(try series_outer_file.findExact("/BinData/BIN0001.OLE")).?].content;
    const series_decoded_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &series_header, item, series_stored, 64 * 1024);
    defer t.allocator.free(series_decoded_inner);
    var series_inner_file = try core.cfb.File.open(t.allocator, series_decoded_inner, .{ .strict = true });
    defer series_inner_file.deinit();
    try t.expectEqual(@as(u16, 4), series_inner_file.header.major);
    try t.expectEqualStrings("inner-preserved", series_inner_file.entries[(try series_inner_file.findExact("/Unknown")).?].content);
    var series_reparsed = try contents.readObservedV6(t.allocator, series_inner_file.entries[(try series_inner_file.findExact("/Contents")).?].content, layout, .{});
    defer series_reparsed.deinit();
    const changed_body = series_reparsed.series.items[0].section.label.body;
    try t.expect(changed_body.text_introduced);
    try t.expectEqual(series_new_id, changed_body.text.?.object_id);
    try t.expectEqualSlices(u8, series_replacement, changed_body.text.?.bytes);
    try t.expectEqual(@as(u8, 0x66), changed_body.text.?.trailer);

    var batch_options = edit_options;
    batch_options.max_edited_contents_bytes = bytes.len + replacement.len + series_replacement.len + point_replacement.len + 45;
    const batch_saved_outer = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &.{ .{ .series_label_body_text = .{ .series_index = 0, .bytes = series_replacement, .trailer = 0x66 } }, .{ .primary_axis_title_font_name = .{ .axis_index = 0, .bytes = replacement, .trailer = 0x55 } }, .{ .null_series_point_label_body_text = .{ .series_index = 0, .point_index = 0, .bytes = point_replacement, .trailer = 0x77 } } }, batch_options);
    defer t.allocator.free(batch_saved_outer);
    var batch_outer_file = try core.cfb.File.open(t.allocator, batch_saved_outer, .{ .strict = true });
    defer batch_outer_file.deinit();
    try t.expectEqualStrings("outer-preserved", batch_outer_file.entries[(try batch_outer_file.findExact("/Sibling")).?].content);
    const batch_header = try core.hwp5.Header.parse(batch_outer_file.entries[(try batch_outer_file.findExact("/FileHeader")).?].content);
    const batch_stored = batch_outer_file.entries[(try batch_outer_file.findExact("/BinData/BIN0001.OLE")).?].content;
    const batch_decoded_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &batch_header, item, batch_stored, 64 * 1024);
    defer t.allocator.free(batch_decoded_inner);
    var batch_inner_file = try core.cfb.File.open(t.allocator, batch_decoded_inner, .{ .strict = true });
    defer batch_inner_file.deinit();
    try t.expectEqual(@as(u16, 4), batch_inner_file.header.major);
    try t.expectEqualStrings("inner-preserved", batch_inner_file.entries[(try batch_inner_file.findExact("/Unknown")).?].content);
    var batch_reparsed = try contents.readObservedV6(t.allocator, batch_inner_file.entries[(try batch_inner_file.findExact("/Contents")).?].content, layout, .{});
    defer batch_reparsed.deinit();
    try t.expectEqual(batch_axis_id, batch_reparsed.primary_axes[0].title.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, batch_reparsed.primary_axes[0].title.font.name.bytes);
    const batch_body = batch_reparsed.series.items[0].section.label.body;
    try t.expectEqual(batch_series_id, batch_body.text.?.object_id);
    try t.expectEqualSlices(u8, series_replacement, batch_body.text.?.bytes);
    const batch_point = batch_reparsed.series.items[0].section.points[0].label.body;
    try t.expect(batch_point.text_introduced);
    try t.expectEqual(batch_point_id, batch_point.text.?.object_id);
    try t.expectEqualSlices(u8, point_replacement, batch_point.text.?.bytes);
    try t.expectEqual(@as(u8, 0x77), batch_point.text.?.trailer);

    const all_fonts = "all-alias-fonts";
    var font_commands: [23]core.hwp5.chart_edit_session.StringEdit = undefined;
    var font_at: usize = 0;
    for (value.primary_axes, 0..) |_, axis_index| {
        font_commands[font_at] = .{ .primary_axis_title_font_name = .{ .axis_index = axis_index, .bytes = all_fonts, .trailer = @intCast(font_at + 1) } };
        font_at += 1;
    }
    font_commands[font_at] = .{ .secondary_axis_title_font_name = .{ .bytes = all_fonts, .trailer = @intCast(font_at + 1) } };
    font_at += 1;
    for (value.series.items, 0..) |series, series_index| {
        font_commands[font_at] = .{ .series_label_font_name = .{ .series_index = series_index, .bytes = all_fonts, .trailer = @intCast(font_at + 1) } };
        font_at += 1;
        font_commands[font_at] = .{ .series_suffix_font_name = .{ .series_index = series_index, .bytes = all_fonts, .trailer = @intCast(font_at + 1) } };
        font_at += 1;
        for (series.section.points, 0..) |_, point_index| {
            font_commands[font_at] = .{ .series_point_label_font_name = .{ .series_index = series_index, .point_index = point_index, .bytes = all_fonts, .trailer = @intCast(font_at + 1) } };
            font_at += 1;
        }
    }
    try t.expectEqual(font_commands.len, font_at);
    var font_options = edit_options;
    font_options.max_edited_contents_bytes = bytes.len + font_commands.len * (all_fonts.len + 15);
    const font_saved_outer = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &font_commands, font_options);
    defer t.allocator.free(font_saved_outer);
    var font_outer_file = try core.cfb.File.open(t.allocator, font_saved_outer, .{ .strict = true });
    defer font_outer_file.deinit();
    const font_header = try core.hwp5.Header.parse(font_outer_file.entries[(try font_outer_file.findExact("/FileHeader")).?].content);
    const font_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &font_header, item, font_outer_file.entries[(try font_outer_file.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(font_inner);
    var font_ole = try core.cfb.File.open(t.allocator, font_inner, .{ .strict = true });
    defer font_ole.deinit();
    var font_chart = try contents.readObservedV6(t.allocator, font_ole.entries[(try font_ole.findExact("/Contents")).?].content, layout, .{});
    defer font_chart.deinit();
    font_at = 0;
    for (font_chart.primary_axes) |axis| {
        try t.expectEqualSlices(u8, all_fonts, axis.title.font.name.bytes);
        try t.expectEqual(@as(u8, @intCast(font_at + 1)), axis.title.font.name.trailer);
        font_at += 1;
    }
    try t.expectEqualSlices(u8, all_fonts, font_chart.secondary_axis.title.font.name.bytes);
    try t.expectEqual(@as(u8, @intCast(font_at + 1)), font_chart.secondary_axis.title.font.name.trailer);
    font_at += 1;
    for (font_chart.series.items) |series| {
        try t.expectEqualSlices(u8, all_fonts, series.section.label.body.font.name.bytes);
        try t.expectEqual(@as(u8, @intCast(font_at + 1)), series.section.label.body.font.name.trailer);
        font_at += 1;
        try t.expectEqualSlices(u8, all_fonts, series.suffix.block.font.name.bytes);
        try t.expectEqual(@as(u8, @intCast(font_at + 1)), series.suffix.block.font.name.trailer);
        font_at += 1;
        for (series.section.points) |point| {
            try t.expectEqualSlices(u8, all_fonts, point.label.body.font.name.bytes);
            try t.expectEqual(@as(u8, @intCast(font_at + 1)), point.label.body.font.name.trailer);
            font_at += 1;
        }
    }
    try t.expectEqual(font_commands.len, font_at);

    const text_block_bytes = "text-block-edit";
    const text_block_commands = [_]core.hwp5.chart_edit_session.StringEdit{
        .{ .series_suffix_text = .{ .series_index = 2, .bytes = text_block_bytes, .trailer = 0x94 } },
        .{ .null_secondary_axis_title_text = .{ .bytes = text_block_bytes, .trailer = 0x91 } },
        .{ .series_suffix_text = .{ .series_index = 0, .bytes = text_block_bytes, .trailer = 0x92 } },
        .{ .series_suffix_text = .{ .series_index = 1, .bytes = text_block_bytes, .trailer = 0x93 } },
    };
    var text_block_options = edit_options;
    text_block_options.max_edited_contents_bytes = bytes.len + text_block_commands.len * (text_block_bytes.len + 15);
    const text_block_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &text_block_commands, text_block_options);
    defer t.allocator.free(text_block_saved);
    var text_block_outer = try core.cfb.File.open(t.allocator, text_block_saved, .{ .strict = true });
    defer text_block_outer.deinit();
    const text_block_header = try core.hwp5.Header.parse(text_block_outer.entries[(try text_block_outer.findExact("/FileHeader")).?].content);
    const text_block_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &text_block_header, item, text_block_outer.entries[(try text_block_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(text_block_inner);
    var text_block_ole = try core.cfb.File.open(t.allocator, text_block_inner, .{ .strict = true });
    defer text_block_ole.deinit();
    var text_block_chart = try contents.readObservedV6(t.allocator, text_block_ole.entries[(try text_block_ole.findExact("/Contents")).?].content, layout, .{});
    defer text_block_chart.deinit();
    try t.expect(text_block_chart.secondary_axis.title.text_introduced);
    try t.expectEqualSlices(u8, text_block_bytes, text_block_chart.secondary_axis.title.text.?.bytes);
    try t.expectEqual(@as(u8, 0x91), text_block_chart.secondary_axis.title.text.?.trailer);
    for (text_block_chart.series.items, 0..) |series, series_index| {
        try t.expect(series.suffix.block.text_introduced);
        try t.expectEqualSlices(u8, text_block_bytes, series.suffix.block.text.?.bytes);
        try t.expectEqual(@as(u8, @intCast(0x92 + series_index)), series.suffix.block.text.?.trailer);
    }

    const format_bytes = "format-code";
    var format_commands: [6]core.hwp5.chart_edit_session.StringEdit = undefined;
    var format_at: usize = 0;
    for (value.series.items, 0..) |series, series_index| {
        for (series.suffix.formats, 0..) |_, format_index| {
            format_commands[format_at] = .{ .null_series_suffix_format_code = .{ .series_index = series_index, .format_index = format_index, .bytes = format_bytes, .trailer = @intCast(0xa1 + format_at) } };
            format_at += 1;
        }
    }
    try t.expectEqual(format_commands.len, format_at);
    var format_options = edit_options;
    format_options.max_edited_contents_bytes = bytes.len + format_commands.len * (format_bytes.len + 15);
    const format_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &format_commands, format_options);
    defer t.allocator.free(format_saved);
    var format_outer = try core.cfb.File.open(t.allocator, format_saved, .{ .strict = true });
    defer format_outer.deinit();
    const format_header = try core.hwp5.Header.parse(format_outer.entries[(try format_outer.findExact("/FileHeader")).?].content);
    const format_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &format_header, item, format_outer.entries[(try format_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(format_inner);
    var format_ole = try core.cfb.File.open(t.allocator, format_inner, .{ .strict = true });
    defer format_ole.deinit();
    var format_chart = try contents.readObservedV6(t.allocator, format_ole.entries[(try format_ole.findExact("/Contents")).?].content, layout, .{});
    defer format_chart.deinit();
    format_at = 0;
    for (format_chart.series.items) |series| {
        for (series.suffix.formats) |format| {
            try t.expect(format.code_introduced);
            try t.expectEqualSlices(u8, format_bytes, format.code.?.bytes);
            try t.expectEqual(@as(u8, @intCast(0xa1 + format_at)), format.code.?.trailer);
            format_at += 1;
        }
    }
    try t.expectEqual(format_commands.len, format_at);

    const axis_format_bytes = "axis-format";
    const axis_format_commands = [_]core.hwp5.chart_edit_session.StringEdit{
        .{ .null_primary_axis_scale_format = .{ .axis_index = 2, .raw_word = 0x1202, .bytes = axis_format_bytes, .trailer = 0xb3 } },
        .{ .null_primary_axis_scale_format = .{ .axis_index = 0, .raw_word = 0x1200, .bytes = axis_format_bytes, .trailer = 0xb1 } },
        .{ .null_primary_axis_scale_format = .{ .axis_index = 1, .raw_word = 0x1201, .bytes = axis_format_bytes, .trailer = 0xb2 } },
    };
    var axis_format_options = edit_options;
    axis_format_options.max_edited_contents_bytes = bytes.len + axis_format_commands.len * (axis_format_bytes.len + 46);
    const axis_format_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &axis_format_commands, axis_format_options);
    defer t.allocator.free(axis_format_saved);
    var axis_format_outer = try core.cfb.File.open(t.allocator, axis_format_saved, .{ .strict = true });
    defer axis_format_outer.deinit();
    const axis_format_header = try core.hwp5.Header.parse(axis_format_outer.entries[(try axis_format_outer.findExact("/FileHeader")).?].content);
    const axis_format_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &axis_format_header, item, axis_format_outer.entries[(try axis_format_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(axis_format_inner);
    var axis_format_ole = try core.cfb.File.open(t.allocator, axis_format_inner, .{ .strict = true });
    defer axis_format_ole.deinit();
    var axis_format_chart = try contents.readObservedV6(t.allocator, axis_format_ole.entries[(try axis_format_ole.findExact("/Contents")).?].content, layout, .{});
    defer axis_format_chart.deinit();
    for (axis_format_chart.primary_axes[0..3], 0..) |axis, axis_index| {
        const materialized = axis.scale.?.value.format.?;
        try t.expectEqual(@as(u16, @intCast(0x1200 + axis_index)), materialized.raw_word);
        try t.expect(materialized.code_introduced);
        try t.expectEqualSlices(u8, axis_format_bytes, materialized.code.bytes);
        try t.expectEqual(@as(u8, @intCast(0xb1 + axis_index)), materialized.code.trailer);
        try t.expect(materialized.object_id != materialized.code.object_id);
    }

    const number_commands = [_]core.hwp5.chart_edit_session.StringEdit{
        .{ .primary_axis_scale_number = .{ .axis_index = 2, .bits = 0x7ff8000000001234, .trailer = 0xca02 } },
        .{ .primary_axis_scale_number = .{ .axis_index = 1, .bits = 0x8000000000000000, .trailer = 0xca01 } },
    };
    const number_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &number_commands, edit_options);
    defer t.allocator.free(number_saved);
    var number_outer = try core.cfb.File.open(t.allocator, number_saved, .{ .strict = true });
    defer number_outer.deinit();
    const number_header = try core.hwp5.Header.parse(number_outer.entries[(try number_outer.findExact("/FileHeader")).?].content);
    const number_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &number_header, item, number_outer.entries[(try number_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(number_inner);
    var number_ole = try core.cfb.File.open(t.allocator, number_inner, .{ .strict = true });
    defer number_ole.deinit();
    var number_chart = try contents.readObservedV6(t.allocator, number_ole.entries[(try number_ole.findExact("/Contents")).?].content, layout, .{});
    defer number_chart.deinit();
    try t.expectEqual(@as(u64, 0x8000000000000000), number_chart.primary_axes[1].scale.?.value.reference.?.value.number.bits);
    try t.expectEqual(@as(u16, 0xca01), number_chart.primary_axes[1].scale.?.value.reference.?.value.number.trailer);
    try t.expectEqual(@as(u64, 0x7ff8000000001234), number_chart.primary_axes[2].scale.?.value.reference.?.value.number.bits);
    try t.expectEqual(@as(u16, 0xca02), number_chart.primary_axes[2].scale.?.value.reference.?.value.number.trailer);

    const grid_saved = try core.hwp5.chart_edit_session.replaceGridCellNumber(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 2, 3, 0x7ff8000000004321, 0xcb03, edit_options);
    defer t.allocator.free(grid_saved);
    var grid_outer = try core.cfb.File.open(t.allocator, grid_saved, .{ .strict = true });
    defer grid_outer.deinit();
    const grid_header = try core.hwp5.Header.parse(grid_outer.entries[(try grid_outer.findExact("/FileHeader")).?].content);
    const grid_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &grid_header, item, grid_outer.entries[(try grid_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(grid_inner);
    var grid_ole = try core.cfb.File.open(t.allocator, grid_inner, .{ .strict = true });
    defer grid_ole.deinit();
    var grid_chart = try contents.readObservedV6(t.allocator, grid_ole.entries[(try grid_ole.findExact("/Contents")).?].content, layout, .{});
    defer grid_chart.deinit();
    const changed_grid_cell = grid_chart.prefix.grid.cells[2 * grid_chart.prefix.grid.prelude.columns + 3];
    try t.expectEqual(@as(u64, 0x7ff8000000004321), changed_grid_cell.value.number.bits);
    try t.expectEqual(@as(u16, 0xcb03), changed_grid_cell.value.number.trailer);

    var null_grid_options = edit_options;
    null_grid_options.max_edited_contents_bytes = bytes.len + 128;
    const null_grid_saved = try core.hwp5.chart_edit_session.materializeGridCellString(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, 0, 0, "materialized-grid", 0xcc, null_grid_options);
    defer t.allocator.free(null_grid_saved);
    var null_grid_outer = try core.cfb.File.open(t.allocator, null_grid_saved, .{ .strict = true });
    defer null_grid_outer.deinit();
    const null_grid_header = try core.hwp5.Header.parse(null_grid_outer.entries[(try null_grid_outer.findExact("/FileHeader")).?].content);
    const null_grid_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &null_grid_header, item, null_grid_outer.entries[(try null_grid_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(null_grid_inner);
    var null_grid_ole = try core.cfb.File.open(t.allocator, null_grid_inner, .{ .strict = true });
    defer null_grid_ole.deinit();
    var null_grid_chart = try contents.readObservedV6(t.allocator, null_grid_ole.entries[(try null_grid_ole.findExact("/Contents")).?].content, layout, .{});
    defer null_grid_chart.deinit();
    try t.expectEqualSlices(u8, "materialized-grid", null_grid_chart.prefix.grid.cells[0].value.string.bytes);
    try t.expectEqual(@as(u8, 0xcc), null_grid_chart.prefix.grid.cells[0].value.string.trailer);
    try t.expectEqual(value.prefix.grid.prelude.types.definitions.count() + 2, null_grid_chart.prefix.grid.prelude.types.definitions.count());
    try t.expectEqual(value.prefix.objects.entries.count() + 1, null_grid_chart.prefix.objects.entries.count());

    const inline_bytes = "inline-file-edit";
    const old_footnote_font = value.prefix.footnote.block.font.name;
    const old_legend_font = value.prefix.legend.font.name;
    const old_inline_ids = [_]u32{ old_footnote_font.object_id, old_legend_font.object_id, value.title.block.font.name.object_id, value.prefix.footnote.block.text.object_id, value.primary_axes[0].title.text.object_id, value.primary_axes[1].title.text.object_id, value.primary_axes[2].title.text.object_id, value.primary_axes[3].title.text.object_id, value.title.block.text.?.object_id };
    const inline_commands = [_]core.hwp5.chart_edit_session.StringEdit{
        .{ .inline_root_title_text = .{ .bytes = inline_bytes, .trailer = 0xd9 } },
        .{ .inline_root_title_font_name = .{ .bytes = inline_bytes, .trailer = 0xd3 } },
        .{ .inline_primary_axis_title_text = .{ .axis_index = 3, .bytes = inline_bytes, .trailer = 0xd8 } },
        .{ .inline_primary_axis_title_text = .{ .axis_index = 2, .bytes = inline_bytes, .trailer = 0xd7 } },
        .{ .inline_primary_axis_title_text = .{ .axis_index = 1, .bytes = inline_bytes, .trailer = 0xd6 } },
        .{ .inline_primary_axis_title_text = .{ .axis_index = 0, .bytes = inline_bytes, .trailer = 0xd5 } },
        .{ .inline_footnote_text = .{ .bytes = inline_bytes, .trailer = 0xd4 } },
        .{ .inline_legend_font_name = .{ .bytes = inline_bytes, .trailer = 0xd2 } },
        .{ .inline_footnote_font_name = .{ .bytes = inline_bytes, .trailer = 0xd1 } },
    };
    var inline_options = edit_options;
    inline_options.max_edited_contents_bytes = bytes.len + inline_commands.len * (inline_bytes.len + 100);
    const inline_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &inline_commands, inline_options);
    defer t.allocator.free(inline_saved);
    var inline_outer = try core.cfb.File.open(t.allocator, inline_saved, .{ .strict = true });
    defer inline_outer.deinit();
    const inline_header = try core.hwp5.Header.parse(inline_outer.entries[(try inline_outer.findExact("/FileHeader")).?].content);
    const inline_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &inline_header, item, inline_outer.entries[(try inline_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(inline_inner);
    var inline_ole = try core.cfb.File.open(t.allocator, inline_inner, .{ .strict = true });
    defer inline_ole.deinit();
    var inline_chart = try contents.readObservedV6(t.allocator, inline_ole.entries[(try inline_ole.findExact("/Contents")).?].content, layout, .{});
    defer inline_chart.deinit();
    const changed_inline = [_]struct { string: core.hwp5.chart_value_object.String, trailer: u8 }{
        .{ .string = inline_chart.prefix.footnote.block.font.name, .trailer = 0xd1 },
        .{ .string = inline_chart.prefix.legend.font.name, .trailer = 0xd2 },
        .{ .string = inline_chart.title.block.font.name, .trailer = 0xd3 },
        .{ .string = inline_chart.prefix.footnote.block.text, .trailer = 0xd4 },
        .{ .string = inline_chart.primary_axes[0].title.text, .trailer = 0xd5 },
        .{ .string = inline_chart.primary_axes[1].title.text, .trailer = 0xd6 },
        .{ .string = inline_chart.primary_axes[2].title.text, .trailer = 0xd7 },
        .{ .string = inline_chart.primary_axes[3].title.text, .trailer = 0xd8 },
        .{ .string = inline_chart.title.block.text.?, .trailer = 0xd9 },
    };
    for (changed_inline, 0..) |changed, changed_index| {
        try t.expectEqualSlices(u8, inline_bytes, changed.string.bytes);
        try t.expectEqual(changed.trailer, changed.string.trailer);
        try t.expect(changed.string.object_id != old_inline_ids[changed_index]);
        for (changed_inline[0..changed_index]) |previous| try t.expect(changed.string.object_id != previous.string.object_id);
    }
    const retained_footnote = inline_chart.prefix.objects.entries.get(old_footnote_font.object_id).?.string;
    const retained_legend = inline_chart.prefix.objects.entries.get(old_legend_font.object_id).?.string;
    try t.expectEqualSlices(u8, old_footnote_font.bytes, retained_footnote.bytes);
    try t.expectEqual(old_footnote_font.trailer, retained_footnote.trailer);
    try t.expectEqualSlices(u8, old_legend_font.bytes, retained_legend.bytes);
    try t.expectEqual(old_legend_font.trailer, retained_legend.trailer);

    var mixed_commands: [inline_commands.len + font_commands.len]core.hwp5.chart_edit_session.StringEdit = undefined;
    @memcpy(mixed_commands[0..inline_commands.len], &inline_commands);
    @memcpy(mixed_commands[inline_commands.len..], &font_commands);
    var mixed_options = edit_options;
    mixed_options.max_edits = mixed_commands.len;
    mixed_options.max_edited_contents_bytes = bytes.len + mixed_commands.len * (inline_bytes.len + all_fonts.len + 100);
    const mixed_saved = try core.hwp5.chart_edit_session.applyStringEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &mixed_commands, mixed_options);
    defer t.allocator.free(mixed_saved);
    var mixed_outer = try core.cfb.File.open(t.allocator, mixed_saved, .{ .strict = true });
    defer mixed_outer.deinit();
    const mixed_header = try core.hwp5.Header.parse(mixed_outer.entries[(try mixed_outer.findExact("/FileHeader")).?].content);
    const mixed_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &mixed_header, item, mixed_outer.entries[(try mixed_outer.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(mixed_inner);
    var mixed_ole = try core.cfb.File.open(t.allocator, mixed_inner, .{ .strict = true });
    defer mixed_ole.deinit();
    var mixed_chart = try contents.readObservedV6(t.allocator, mixed_ole.entries[(try mixed_ole.findExact("/Contents")).?].content, layout, .{});
    defer mixed_chart.deinit();
    try t.expectEqualSlices(u8, inline_bytes, mixed_chart.prefix.footnote.block.font.name.bytes);
    try t.expectEqualSlices(u8, inline_bytes, mixed_chart.prefix.legend.font.name.bytes);
    try t.expectEqualSlices(u8, all_fonts, mixed_chart.primary_axes[0].title.font.name.bytes);
    try t.expectEqualSlices(u8, all_fonts, mixed_chart.series.items[2].section.points[3].label.body.font.name.bytes);

    const all_texts = "all-non-inline-texts";
    var complete_commands: [82]core.hwp5.chart_edit_session.Edit = undefined;
    var complete_at: usize = 0;
    @memcpy(complete_commands[complete_at..][0..inline_commands.len], &inline_commands);
    complete_at += inline_commands.len;
    @memcpy(complete_commands[complete_at..][0..font_commands.len], &font_commands);
    complete_at += font_commands.len;
    complete_commands[complete_at] = .{ .null_secondary_axis_title_text = .{ .bytes = all_texts, .trailer = 0xe0 } };
    complete_at += 1;
    for (value.series.items, 0..) |series, series_index| {
        complete_commands[complete_at] = .{ .series_label_body_text = .{ .series_index = series_index, .bytes = all_texts, .trailer = 0xe1 } };
        complete_at += 1;
        complete_commands[complete_at] = .{ .series_suffix_text = .{ .series_index = series_index, .bytes = all_texts, .trailer = 0xe2 } };
        complete_at += 1;
        for (series.section.points, 0..) |_, point_index| {
            complete_commands[complete_at] = .{ .null_series_point_label_body_text = .{ .series_index = series_index, .point_index = point_index, .bytes = all_texts, .trailer = 0xe3 } };
            complete_at += 1;
        }
    }
    @memcpy(complete_commands[complete_at..][0..format_commands.len], &format_commands);
    complete_at += format_commands.len;
    @memcpy(complete_commands[complete_at..][0..axis_format_commands.len], &axis_format_commands);
    complete_at += axis_format_commands.len;
    @memcpy(complete_commands[complete_at..][0..number_commands.len], &number_commands);
    complete_at += number_commands.len;
    var cell_index = value.prefix.grid.cells.len;
    while (cell_index > 0) {
        cell_index -= 1;
        if (value.prefix.grid.cells[cell_index].value == .number) {
            complete_commands[complete_at] = .{ .grid_cell_number = .{ .row = cell_index / value.prefix.grid.prelude.columns, .column = cell_index % value.prefix.grid.prelude.columns, .bits = 0x3ff0000000000000 + cell_index, .trailer = @intCast(0xd000 + cell_index) } };
            complete_at += 1;
        }
    }
    complete_commands[complete_at] = .{ .null_grid_cell_string = .{ .row = 0, .column = 0, .bytes = "grid-null", .trailer = 0xd2 } };
    complete_at += 1;
    cell_index = value.prefix.grid.cells.len;
    while (cell_index > 0) {
        cell_index -= 1;
        if (value.prefix.grid.cells[cell_index].value == .string) {
            complete_commands[complete_at] = .{ .grid_cell_string = .{ .row = cell_index / value.prefix.grid.prelude.columns, .column = cell_index % value.prefix.grid.prelude.columns, .bytes = "grid-all", .trailer = 0xd1 } };
            complete_at += 1;
        }
    }
    try t.expectEqual(complete_commands.len, complete_at);
    var complete_options = edit_options;
    complete_options.max_edits = complete_commands.len;
    complete_options.max_edited_contents_bytes = bytes.len + complete_commands.len * 160;
    const complete_saved = try core.hwp5.chart_edit_session.applyEdits(t.allocator, outer, 1, .observed_optional_extension, .raw_cfb, layout, &complete_commands, complete_options);
    defer t.allocator.free(complete_saved);
    var complete_outer = try core.cfb.File.open(t.allocator, complete_saved, .{ .strict = true });
    defer complete_outer.deinit();
    const complete_header = try core.hwp5.Header.parse(complete_outer.entries[(try complete_outer.findExact("/FileHeader")).?].content);
    const complete_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &complete_header, item, complete_outer.entries[(try complete_outer.findExact("/BinData/BIN0001.OLE")).?].content, 128 * 1024);
    defer t.allocator.free(complete_inner);
    var complete_ole = try core.cfb.File.open(t.allocator, complete_inner, .{ .strict = true });
    defer complete_ole.deinit();
    var complete_chart = try contents.readObservedV6(t.allocator, complete_ole.entries[(try complete_ole.findExact("/Contents")).?].content, layout, .{});
    defer complete_chart.deinit();
    try t.expectEqualSlices(u8, inline_bytes, complete_chart.prefix.footnote.block.font.name.bytes);
    try t.expectEqualSlices(u8, inline_bytes, complete_chart.prefix.legend.font.name.bytes);
    try t.expectEqualSlices(u8, inline_bytes, complete_chart.title.block.font.name.bytes);
    try t.expectEqualSlices(u8, inline_bytes, complete_chart.prefix.footnote.block.text.bytes);
    try t.expectEqualSlices(u8, inline_bytes, complete_chart.title.block.text.?.bytes);
    try t.expectEqualSlices(u8, all_texts, complete_chart.secondary_axis.title.text.?.bytes);
    for (complete_chart.primary_axes, 0..) |axis, axis_index| {
        try t.expectEqualSlices(u8, all_fonts, axis.title.font.name.bytes);
        try t.expectEqualSlices(u8, inline_bytes, axis.title.text.bytes);
        if (axis_index < 3) try t.expectEqualSlices(u8, axis_format_bytes, axis.scale.?.value.format.?.code.bytes);
        if (axis_index == 1) try t.expectEqual(@as(u64, 0x8000000000000000), axis.scale.?.value.reference.?.value.number.bits);
        if (axis_index == 2) try t.expectEqual(@as(u64, 0x7ff8000000001234), axis.scale.?.value.reference.?.value.number.bits);
    }
    for (complete_chart.prefix.grid.cells, 0..) |cell, index| if (cell.value == .number) {
        try t.expectEqual(value.prefix.grid.cells[index].object_id, cell.object_id);
        try t.expectEqual(@as(u64, 0x3ff0000000000000) + index, cell.value.number.bits);
        try t.expectEqual(@as(u16, @intCast(0xd000 + index)), cell.value.number.trailer);
    };
    for (complete_chart.prefix.grid.cells) |cell| if (cell.value == .string) {
        if (cell.start == complete_chart.prefix.grid.cells[0].start) {
            try t.expectEqualSlices(u8, "grid-null", cell.value.string.bytes);
            try t.expectEqual(@as(u8, 0xd2), cell.value.string.trailer);
        } else {
            try t.expectEqualSlices(u8, "grid-all", cell.value.string.bytes);
            try t.expectEqual(@as(u8, 0xd1), cell.value.string.trailer);
        }
    };
    for (complete_chart.series.items) |series| {
        try t.expectEqualSlices(u8, all_fonts, series.section.label.body.font.name.bytes);
        try t.expectEqualSlices(u8, all_texts, series.section.label.body.text.?.bytes);
        try t.expectEqualSlices(u8, all_fonts, series.suffix.block.font.name.bytes);
        try t.expectEqualSlices(u8, all_texts, series.suffix.block.text.?.bytes);
        for (series.suffix.formats) |format| try t.expectEqualSlices(u8, format_bytes, format.code.?.bytes);
        for (series.section.points) |point| {
            try t.expectEqualSlices(u8, all_fonts, point.label.body.font.name.bytes);
            try t.expectEqualSlices(u8, all_texts, point.label.body.text.?.bytes);
        }
    }

    var multi_options = edit_options;
    multi_options.file.bin_data.max_total_encoded_bytes = 128 * 1024;
    const multi_commands = [_]core.hwp5.chart_edit_session.ChartCommand{ .{ .ordinal = 1, .ole_layout = .raw_cfb, .chart_layout = layout, .edits = &.{.{ .primary_axis_title_font_name = .{ .axis_index = 0, .bytes = replacement, .trailer = 0x55 } }} }, .{ .ordinal = 2, .ole_layout = .raw_cfb, .chart_layout = layout, .edits = &.{.{ .series_label_body_text = .{ .series_index = 0, .bytes = series_replacement, .trailer = 0x66 } }} } };
    try t.expectError(error.EmptyChartEditSet, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &.{}, .observed_optional_extension, multi_options));
    var one_chart_only = multi_options;
    one_chart_only.file.bin_data.max_edits = 1;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &multi_commands, .observed_optional_extension, one_chart_only));
    var empty_chart = multi_commands[0];
    empty_chart.edits = &.{};
    try t.expectError(error.EmptyChartEditBatch, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &.{empty_chart}, .observed_optional_extension, multi_options));
    const reversed_charts = [_]core.hwp5.chart_edit_session.ChartCommand{ multi_commands[1], multi_commands[0] };
    try t.expectError(error.InvalidBinDataOrdinalOrder, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &reversed_charts, .observed_optional_extension, multi_options));
    const duplicate_charts = [_]core.hwp5.chart_edit_session.ChartCommand{ multi_commands[0], multi_commands[0] };
    try t.expectError(error.InvalidBinDataOrdinalOrder, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &duplicate_charts, .observed_optional_extension, multi_options));
    var low_total_contents = multi_options;
    low_total_contents.max_total_edited_contents_bytes = bytes.len + replacement.len + 15;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &multi_commands, .observed_optional_extension, low_total_contents));
    var low_total_decoded = multi_options;
    low_total_decoded.file.max_total_decoded_bin_data_bytes = inner.len;
    try t.expectError(error.LimitExceeded, core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &multi_commands, .observed_optional_extension, low_total_decoded));
    const multi_saved_outer = try core.hwp5.chart_edit_session.applyCharts(t.allocator, outer, &multi_commands, .observed_optional_extension, multi_options);
    defer t.allocator.free(multi_saved_outer);
    try t.checkAllAllocationFailures(t.allocator, exerciseMultiChartSession, .{ outer, multi_options });
    var multi_outer_file = try core.cfb.File.open(t.allocator, multi_saved_outer, .{ .strict = true });
    defer multi_outer_file.deinit();
    try t.expectEqual(@as(u16, 3), multi_outer_file.header.major);
    try t.expectEqualStrings("outer-preserved", multi_outer_file.entries[(try multi_outer_file.findExact("/Sibling")).?].content);
    const multi_header = try core.hwp5.Header.parse(multi_outer_file.entries[(try multi_outer_file.findExact("/FileHeader")).?].content);
    const item2: core.hwp5.docinfo.BinData = .{ .attributes = 2, .data = .{ .storage = 2 }, .extra = &.{ 3, 0, 'O', 0, 'L', 0, 'E', 0 } };
    const multi_first_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &multi_header, item, multi_outer_file.entries[(try multi_outer_file.findExact("/BinData/BIN0001.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(multi_first_inner);
    const multi_second_inner = try core.hwp5.bin_data_stream.decode(t.allocator, &multi_header, item2, multi_outer_file.entries[(try multi_outer_file.findExact("/BinData/BIN0002.OLE")).?].content, 64 * 1024);
    defer t.allocator.free(multi_second_inner);
    var multi_first_ole = try core.cfb.File.open(t.allocator, multi_first_inner, .{ .strict = true });
    defer multi_first_ole.deinit();
    var multi_second_ole = try core.cfb.File.open(t.allocator, multi_second_inner, .{ .strict = true });
    defer multi_second_ole.deinit();
    try t.expectEqualStrings("inner-preserved", multi_first_ole.entries[(try multi_first_ole.findExact("/Unknown")).?].content);
    try t.expectEqualStrings("inner-preserved", multi_second_ole.entries[(try multi_second_ole.findExact("/Unknown")).?].content);
    var multi_first_chart = try contents.readObservedV6(t.allocator, multi_first_ole.entries[(try multi_first_ole.findExact("/Contents")).?].content, layout, .{});
    defer multi_first_chart.deinit();
    var multi_second_chart = try contents.readObservedV6(t.allocator, multi_second_ole.entries[(try multi_second_ole.findExact("/Contents")).?].content, layout, .{});
    defer multi_second_chart.deinit();
    try t.expectEqualSlices(u8, replacement, multi_first_chart.primary_axes[0].title.font.name.bytes);
    try t.expectEqualSlices(u8, series_replacement, multi_second_chart.series.items[0].section.label.body.text.?.bytes);
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
    const body = &value.series.items[0].section.label.body;
    try t.expectError(error.EmptyChartStringForkBatch, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{}, bytes.len));
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{ .{ .font_name = .{ .font = target, .new_object_id = 0xfffffffa, .bytes = "a", .trailer = 0 } }, .{ .text_body = .{ .body = body, .new_object_id = 0xfffffffa, .bytes = "b", .trailer = 0 } } }, bytes.len + 32));
    try t.expectError(error.OverlappingChartPatches, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{ .{ .font_name = .{ .font = target, .new_object_id = 0xfffffffa, .bytes = "a", .trailer = 0 } }, .{ .font_name = .{ .font = target, .new_object_id = 0xfffffff9, .bytes = "b", .trailer = 0 } } }, bytes.len + 32));
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
test "actual inline String fork relocates shared definition and isolates singleton" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();

    const shared_font = &value.prefix.footnote.block.font;
    const shared: core.hwp5.chart_object_table.Reference = .{ .value = shared_font.name, .introduced = shared_font.name_introduced, .start = shared_font.name_start, .end = shared_font.name_end };
    const old_id = shared.value.object_id;
    const old_bytes = shared.value.bytes;
    const old_trailer = shared.value.trailer;
    const new_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{});
    const replacement = "isolated-footnote-font";
    const shared_max = bytes.len - old_bytes.len + replacement.len + old_bytes.len + 15;
    const forked = try core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &shared, new_id, replacement, 0xc1, shared_max);
    defer t.allocator.free(forked);
    var reparsed = try contents.readObservedV6(t.allocator, forked, layout, .{});
    defer reparsed.deinit();
    try t.expectEqual(new_id, reparsed.prefix.footnote.block.font.name.object_id);
    try t.expectEqualSlices(u8, replacement, reparsed.prefix.footnote.block.font.name.bytes);
    try t.expectEqual(@as(u8, 0xc1), reparsed.prefix.footnote.block.font.name.trailer);
    var old_references: usize = 0;
    var old_definitions: usize = 0;
    for (reparsed.prefix.objects.references.items) |reference| if (reference.object_id == old_id) {
        old_references += 1;
        old_definitions += @intFromBool(reference.introduced);
    };
    try t.expectEqual(@as(usize, 21), old_references);
    try t.expectEqual(@as(usize, 1), old_definitions);
    const retained = reparsed.prefix.objects.entries.get(old_id).?.string;
    try t.expectEqualSlices(u8, old_bytes, retained.bytes);
    try t.expectEqual(old_trailer, retained.trailer);

    const singleton_block = &value.title.block;
    const singleton: core.hwp5.chart_object_table.Reference = .{ .value = singleton_block.text.?, .introduced = singleton_block.text_introduced, .start = singleton_block.text_start, .end = singleton_block.text_end };
    const singleton_bytes = "isolated-title";
    const singleton_id = try core.hwp5.chart_object_id_allocator.findLowestAvailable(&value.prefix.objects, &.{new_id});
    const singleton_max = bytes.len - singleton.value.bytes.len + singleton_bytes.len;
    const singleton_forked = try core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &singleton, singleton_id, singleton_bytes, 0xc2, singleton_max);
    defer t.allocator.free(singleton_forked);
    var singleton_reparsed = try contents.readObservedV6(t.allocator, singleton_forked, layout, .{});
    defer singleton_reparsed.deinit();
    try t.expectEqual(singleton_id, singleton_reparsed.title.block.text.?.object_id);
    try t.expectEqualSlices(u8, singleton_bytes, singleton_reparsed.title.block.text.?.bytes);
    try t.expectEqual(@as(u8, 0xc2), singleton_reparsed.title.block.text.?.trailer);
    try t.expect(!singleton_reparsed.prefix.objects.entries.contains(singleton.value.object_id));

    const alias_font = &value.primary_axes[0].title.font;
    const alias: core.hwp5.chart_object_table.Reference = .{ .value = alias_font.name, .introduced = alias_font.name_introduced, .start = alias_font.name_start, .end = alias_font.name_end };
    try t.expectError(error.ExpectedInlineChartString, core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &alias, 0xffffff00, "x", 0, bytes.len + 64));
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &shared, old_id, "x", 0, bytes.len + 64));
    var bad_span = shared;
    bad_span.end -= 1;
    try t.expectError(error.InvalidChartStringReferenceGraph, core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &bad_span, 0xffffff00, "x", 0, bytes.len + 64));
    bytes[shared.start] ^= 1;
    try t.expectError(error.InvalidChartStringDefinitionSpan, core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &shared, 0xffffff00, "x", 0, bytes.len + 64));
    bytes[shared.start] ^= 1;
    for (value.prefix.objects.references.items) |*reference| if (reference.start == shared.start) {
        reference.introduced = false;
        break;
    };
    try t.expectError(error.InvalidChartStringReferenceGraph, core.hwp5.chart_contents_inline_fork.forkIntroduced(t.allocator, &value, &shared, 0xffffff00, "x", 0, bytes.len + 64));
}
test "actual Contents null TextFormat materialization validation" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const block = &value.primary_axes[0].scale.?.value;
    const existing_type = value.prefix.grid.prelude.types.findLowestId("VtString\x00", 1).?;
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_format_materialize.replacement(t.allocator, &value, block, 0xfffffff0, 0xfffffff0, 0xffffffef, 1, "x", 0));
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_format_materialize.replacement(t.allocator, &value, block, value.prefix.legend.font.object_id, 0xfffffff0, 0xffffffef, 1, "x", 0));
    try t.expectError(error.DuplicateChartTypeId, core.hwp5.chart_format_materialize.replacement(t.allocator, &value, block, 0xfffffff0, 0xffffffef, existing_type, 1, "x", 0));
    try t.expectError(error.DuplicateChartTypeId, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{ .{ .null_text_format_object = .{ .block = block, .format_object_id = 0xfffffff0, .code_object_id = 0xffffffef, .format_type_id = 0xffffffee, .raw_word = 1, .bytes = "x", .trailer = 0 } }, .{ .null_text_format_object = .{ .block = &value.primary_axes[1].scale.?.value, .format_object_id = 0xffffffed, .code_object_id = 0xffffffec, .format_type_id = 0xffffffee, .raw_word = 2, .bytes = "y", .trailer = 1 } } }, bytes.len + 128));
    bytes[block.format_start] ^= 1;
    try t.expectError(error.InvalidChartFormatSpan, core.hwp5.chart_format_materialize.replacement(t.allocator, &value, block, 0xfffffff0, 0xffffffef, 0xffffffee, 1, "x", 0));
}
test "actual Contents Double payload edit is fixed-width and validated" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const reference = &value.primary_axes[1].scale.?.value.reference.?;
    const original_id = reference.value.number.object_id;
    const edited = try core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{.{ .number_payload = .{ .number = reference.value.number, .bits = 0xffffffffffffffff, .trailer = 0xa55a } }}, bytes.len);
    defer t.allocator.free(edited);
    try t.expectEqual(bytes.len, edited.len);
    var reparsed = try contents.readObservedV6(t.allocator, edited, layout, .{});
    defer reparsed.deinit();
    const changed = reparsed.primary_axes[1].scale.?.value.reference.?.value.number;
    try t.expectEqual(original_id, changed.object_id);
    try t.expectEqual(@as(u64, 0xffffffffffffffff), changed.bits);
    try t.expectEqual(@as(u16, 0xa55a), changed.trailer);
    try t.expectError(error.OverlappingChartPatches, core.hwp5.chart_contents_string_fork.forkMany(t.allocator, &value, &.{ .{ .number_payload = .{ .number = reference.value.number, .bits = 1, .trailer = 2 } }, .{ .number_payload = .{ .number = reference.value.number, .bits = 3, .trailer = 4 } } }, bytes.len));
    const font = value.primary_axes[0].title.font;
    const string_reference: core.hwp5.chart_object_table.ValueReference = .{ .value = .{ .string = font.name }, .introduced = font.name_introduced, .start = font.name_start, .end = font.name_end };
    try t.expectError(error.ExpectedChartNumber, core.hwp5.chart_contents_number_edit.replacement(t.allocator, &value, &string_reference, 0, 0));
    const number = reference.value.number;
    try core.hwp5.chart_contents_number_edit.requireUniqueReference(&value.prefix.objects, number.object_id);
    try value.prefix.objects.references.append(t.allocator, .{ .object_id = number.object_id, .introduced = false, .start = reference.start, .end = reference.start + 4 });
    try t.expectError(error.SharedChartNumberObject, core.hwp5.chart_contents_number_edit.requireUniqueReference(&value.prefix.objects, number.object_id));
    bytes[number.payload_start] ^= 1;
    try t.expectError(error.InvalidChartNumberSource, core.hwp5.chart_contents_number_edit.replacement(t.allocator, &value, reference, 0, 0));
}
test "actual Contents Grid number target validates coordinate kind and sharing" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    try t.expectError(error.InvalidChartGridRow, core.hwp5.chart_grid_number_target.resolve(&value, value.prefix.grid.prelude.rows, 0));
    try t.expectError(error.InvalidChartGridColumn, core.hwp5.chart_grid_number_target.resolve(&value, 0, value.prefix.grid.prelude.columns));
    try t.expectError(error.ExpectedChartNumber, core.hwp5.chart_grid_number_target.resolve(&value, 0, 0));
    const number = try core.hwp5.chart_grid_number_target.resolve(&value, 2, 3);
    try t.expectEqual(value.prefix.grid.cells[11].object_id.?, number.object_id);
    try value.prefix.objects.references.append(t.allocator, .{ .object_id = number.object_id, .introduced = false, .start = 0, .end = 4 });
    try t.expectError(error.SharedChartNumberObject, core.hwp5.chart_grid_number_target.resolve(&value, 2, 3));
}
test "actual Contents Grid string target preserves inline coordinate span" {
    const bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    try t.expectError(error.InvalidChartGridRow, core.hwp5.chart_grid_string_target.resolve(&value, value.prefix.grid.prelude.rows, 0));
    try t.expectError(error.InvalidChartGridColumn, core.hwp5.chart_grid_string_target.resolve(&value, 0, value.prefix.grid.prelude.columns));
    try t.expectError(error.ExpectedChartString, core.hwp5.chart_grid_string_target.resolve(&value, 1, 1));
    const reference = try core.hwp5.chart_grid_string_target.resolve(&value, 2, 0);
    const cell = value.prefix.grid.cells[8];
    try t.expect(reference.introduced);
    try t.expectEqual(cell.start, reference.start);
    try t.expectEqual(cell.end, reference.end);
    try t.expectEqual(cell.object_id.?, reference.value.object_id);
    try t.expectEqualSlices(u8, cell.value.string.bytes, reference.value.bytes);
}
test "actual Contents null Grid String materializer validates identities and source" {
    var bytes = try decode();
    var value = try contents.readObservedV6(t.allocator, &bytes, layout, .{});
    defer value.deinit();
    const cell = try core.hwp5.chart_grid_null_target.resolve(&value, 0, 0);
    try t.expectError(error.ExpectedNullChartCell, core.hwp5.chart_grid_null_target.resolve(&value, 4, 0));
    const valid = try core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, 0xfffffff0, 0xfffffff1, 0xfffffff2, "x", 7);
    defer t.allocator.free(valid);
    try t.expectEqual(@as(usize, 45), valid.len);
    try t.expectEqual(@as(u32, 0xfffffff0), std.mem.readInt(u32, valid[0..4], .little));
    try t.expectEqual(@as(u32, 0xfffffff1), std.mem.readInt(u32, valid[4..8], .little));
    try t.expectEqualSlices(u8, "VtString\x00", valid[10..19]);
    try t.expectEqual(@as(u16, 1), std.mem.readInt(u16, valid[19..21], .little));
    try t.expectEqualSlices(u8, "x", valid[23..24]);
    try t.expectEqual(@as(u8, 7), valid[24]);
    try t.expectEqual(@as(u32, 0xfffffff2), std.mem.readInt(u32, valid[25..29], .little));
    try t.expectEqualSlices(u8, "VtValue\x00", valid[31..39]);
    try t.expectEqual(@as(u16, 1), std.mem.readInt(u16, valid[39..41], .little));
    try t.expectEqual(value.prefix.grid.prelude.types.findLowestId("VtObject\x00", 1).?, std.mem.readInt(u32, valid[41..45], .little));
    try t.expectError(error.ExpectedNullChartCell, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, &value.prefix.grid.cells[1], 0xfffffff0, 0xfffffff1, 0xfffffff2, "x", 7));
    try t.expectError(error.UnsupportedChartObjectReference, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, 0xffffffff, 0xfffffff1, 0xfffffff2, "x", 7));
    try t.expectError(error.DuplicateChartObjectId, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, value.prefix.grid.cells[1].object_id.?, 0xfffffff1, 0xfffffff2, "x", 7));
    try t.expectError(error.DuplicateChartTypeId, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, 0xfffffff0, 0xfffffff1, 0xfffffff1, "x", 7));
    const existing_type = value.prefix.grid.prelude.types.findLowestId("VtObject\x00", 1).?;
    try t.expectError(error.DuplicateChartTypeId, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, 0xfffffff0, existing_type, 0xfffffff2, "x", 7));
    bytes[cell.start] ^= 1;
    try t.expectError(error.InvalidChartGridCellSpan, core.hwp5.chart_grid_string_materialize.replacement(t.allocator, &value, cell, 0xfffffff0, 0xfffffff1, 0xfffffff2, "x", 7));
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
