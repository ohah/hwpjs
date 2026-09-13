const std = @import("std");
const t = std.testing;
const core = @import("hwpjs");
const fixture = @import("wmf_fixture");

fn syntheticRecordHeader(max: u32) core.image.wmf_header.Header {
    return .{
        .placeable = undefined,
        .meta = .{ .metafile_type = .memory, .version = .version_300, .size_words = 0, .number_of_objects = 0, .max_record_words = max, .number_of_members = 0 },
        .records_offset = 0,
    };
}

fn syntheticObjectHeader(slots: u16) core.image.wmf_header.Header {
    var value = syntheticRecordHeader(0);
    value.meta.number_of_objects = slots;
    return value;
}

fn syntheticRecord(function: u16, size_words: u32, parameters: []const u8) core.image.wmf_records.Record {
    return .{ .offset = 0, .size_words = size_words, .function = function, .parameters = parameters, .end = @as(usize, size_words) * 2 };
}

test "actual HWP OLE CONTENTS is an explicitly selected payload-sized placeable WMF" {
    const value = try core.image.wmf_header.parse(fixture.bytes, .observed_payload_words);
    try t.expectError(error.InvalidWmfSize, core.image.wmf_header.parse(fixture.bytes, .specified));
    try t.expectEqual(@as(usize, 24746), fixture.bytes.len);
    try t.expectEqual(@as(usize, 40), value.records_offset);
    try t.expectEqual(@as(u16, 0), value.placeable.handle);
    try t.expectEqual(@as(i16, 0), value.placeable.bounds.left);
    try t.expectEqual(@as(i16, 0), value.placeable.bounds.top);
    try t.expectEqual(@as(i16, 5446), value.placeable.bounds.right);
    try t.expectEqual(@as(i16, 2160), value.placeable.bounds.bottom);
    try t.expectEqual(@as(u16, 576), value.placeable.inch);
    try t.expectEqual(@as(u16, 18535), value.placeable.checksum);
    try t.expectEqual(core.image.wmf_header.MetafileType.memory, value.meta.metafile_type);
    try t.expectEqual(core.image.wmf_header.Version.version_300, value.meta.version);
    try t.expectEqual(@as(u32, 12353), value.meta.size_words);
    try t.expectEqual(@as(u16, 9), value.meta.number_of_objects);
    try t.expectEqual(@as(u32, 460), value.meta.max_record_words);
    try t.expectEqual(@as(u16, 0), value.meta.number_of_members);
    const records = try core.image.wmf_records.validate(fixture.bytes, value, .{ .trailing_zero_words = 9 });
    try t.expectEqual(@as(usize, 1886), records.count);
    try t.expectEqual(@as(u32, 460), records.max_record_words);
    try t.expectEqual(@as(usize, 24728), records.eof_end);
    try t.expectEqual(@as(usize, 9), records.trailing_zero_words);
    try t.expectError(error.DataAfterWmfEof, core.image.wmf_records.validate(fixture.bytes, value, .{}));
    const objects = try core.image.wmf_objects.validate(t.allocator, fixture.bytes, value, records);
    try t.expectEqual(@as(usize, 197), objects.creates);
    try t.expectEqual(@as(usize, 680), objects.selects);
    try t.expectEqual(@as(usize, 192), objects.deletes);
    try t.expectEqual(@as(usize, 9), objects.peak_live);
    try t.expectEqual(@as(usize, 5), objects.final_live);
    const payloads = try core.image.wmf_create_payloads.inspect(fixture.bytes, value, records, .observed_preserve);
    try t.expectEqual(@as(usize, 128), payloads.pens);
    try t.expectEqual(@as(usize, 43), payloads.brushes);
    try t.expectEqual(@as(usize, 26), payloads.fonts);
    try t.expectEqual(@as(usize, 75), payloads.nonzero_color_reserved);
    try t.expectEqual(@as(usize, 25), payloads.nonempty_face_names);
    try t.expectEqual(@as(usize, 234), payloads.face_name_bytes);
    try t.expectError(error.InvalidWmfColorReserved, core.image.wmf_create_payloads.inspect(fixture.bytes, value, records, .specified_zero));
    const state = try core.image.wmf_state_records.inspect(fixture.bytes, value, records, .observed_preserve);
    try t.expectEqual(@as(usize, 60), state.background_transparent);
    try t.expectEqual(@as(usize, 88), state.background_opaque);
    try t.expectEqual(@as(usize, 1), state.raster_operations);
    try t.expectEqual(@as(usize, 2), state.polygon_alternate);
    try t.expectEqual(@as(usize, 2), state.polygon_winding);
    try t.expectEqual(@as(usize, 96), state.text_colors);
    try t.expectEqual(@as(usize, 96), state.nonzero_color_reserved);
    try t.expectEqual(@as(usize, 1), state.window_origins);
    try t.expectEqual(@as(i64, 60), state.window_origin_x_sum);
    try t.expectEqual(@as(i64, 1008), state.window_origin_y_sum);
    try t.expectEqual(@as(usize, 1), state.window_extents);
    try t.expectEqual(@as(i64, 5464), state.window_extent_x_sum);
    try t.expectEqual(@as(i64, 2173), state.window_extent_y_sum);
    try t.expectEqual(@as(usize, 96), state.moves);
    try t.expectEqual(@as(i64, 267579), state.move_x_sum);
    try t.expectEqual(@as(i64, 143072), state.move_y_sum);
    try t.expectEqual(@as(usize, 8), state.lines);
    try t.expectEqual(@as(i64, 20994), state.line_x_sum);
    try t.expectEqual(@as(i64, 13754), state.line_y_sum);
    try t.expectError(error.InvalidWmfColorReserved, core.image.wmf_state_records.inspect(fixture.bytes, value, records, .specified_zero));
    const drawings = try core.image.wmf_drawing_records.inspect(fixture.bytes, value, records);
    try t.expectEqual(@as(usize, 2), drawings.polygons);
    try t.expectEqual(@as(usize, 456), drawings.polygon_points);
    try t.expectEqual(@as(i64, 2100296), drawings.polygon_x_sum);
    try t.expectEqual(@as(i64, 698698), drawings.polygon_y_sum);
    try t.expectEqual(@as(usize, 51), drawings.polylines);
    try t.expectEqual(@as(usize, 150), drawings.polyline_points);
    try t.expectEqual(@as(i64, 441001), drawings.polyline_x_sum);
    try t.expectEqual(@as(i64, 271796), drawings.polyline_y_sum);
    try t.expectEqual(@as(usize, 64), drawings.ellipses);
    try t.expectEqual(@as(i64, 159886), drawings.ellipse_left_sum);
    try t.expectEqual(@as(i64, 124086), drawings.ellipse_top_sum);
    try t.expectEqual(@as(i64, 170390), drawings.ellipse_right_sum);
    try t.expectEqual(@as(i64, 129686), drawings.ellipse_bottom_sum);
    try t.expectEqual(@as(usize, 46), drawings.rectangles);
    try t.expectEqual(@as(i64, 121796), drawings.rectangle_left_sum);
    try t.expectEqual(@as(i64, 83018), drawings.rectangle_top_sum);
    try t.expectEqual(@as(i64, 145226), drawings.rectangle_right_sum);
    try t.expectEqual(@as(i64, 87922), drawings.rectangle_bottom_sum);
    const text = try core.image.wmf_text_records.inspect(fixture.bytes, value, records, .from_options);
    try t.expectEqual(@as(usize, 120), text.alignments);
    try t.expectEqual(@as(usize, 60), text.alignment_baseline);
    try t.expectEqual(@as(usize, 60), text.alignment_update_cp);
    try t.expectEqual(@as(usize, 60), text.ext_texts);
    try t.expectEqual(@as(usize, 248), text.string_bytes);
    try t.expectEqual(@as(usize, 8), text.string_padding);
    try t.expectEqual(@as(usize, 6), text.nonzero_string_padding);
    try t.expectEqual(@as(usize, 248), text.dx_values);
    try t.expectEqual(@as(i64, 13484), text.dx_sum);
    try t.expectEqual(@as(i64, 136594), text.x_sum);
    try t.expectEqual(@as(i64, 133130), text.y_sum);
    try t.expectEqual(@as(usize, 118), text.escapes);
    try t.expectEqual(@as(usize, 118), text.enhanced_metafile_escapes);
    try t.expectEqual(@as(usize, 1689), text.escape_bytes);
    try t.expectEqual(@as(usize, 1), text.escape_padding);
    try t.expectEqual(@as(usize, 0), text.nonzero_escape_padding);
    const enhanced = try core.image.wmf_enhanced_metafile_records.inspect(fixture.bytes, value, records);
    try t.expectEqual(@as(usize, 118), enhanced.candidates);
    try t.expectEqual(@as(usize, 0), enhanced.conforming);
    try t.expectEqual(@as(usize, 118), enhanced.nonconforming);
    try t.expectEqual(@as(usize, 0), enhanced.chunk_bytes);
}

test "public WMF text audit pins alignment padding Dx rectangle and escape length" {
    const align_short = [_]u8{ 0x18, 0 };
    const alignment = try core.image.wmf_text_align.parse(syntheticRecord(0x012e, 4, &align_short));
    try t.expectEqual(@as(?u16, null), alignment.reserved);
    const invalid_alignment = [_]u8{ 4, 0 };
    try t.expectError(error.UnsupportedWmfTextAlignment, core.image.wmf_text_align.parse(syntheticRecord(0x012e, 4, &invalid_alignment)));

    const ext_bytes = [_]u8{ 0xfe, 0xff, 3, 0, 3, 0, 0, 0, 'a', 'b', 'c', 0xd6, 1, 0, 0xfe, 0xff, 3, 0 };
    const ext = try core.image.wmf_ext_text_out.parse(syntheticRecord(0x0a32, 12, &ext_bytes), .absent);
    try t.expectEqual(@as(i16, 3), ext.x);
    try t.expectEqual(@as(i16, -2), ext.y);
    try t.expectEqualSlices(u8, "abc", ext.string);
    try t.expectEqual(@as(?u8, 0xd6), ext.padding);
    try t.expectEqual(@as(usize, 3), ext.dx_count);
    try t.expectEqual(@as(i16, -2), try ext.dx(1));
    try t.expectError(error.InvalidWmfDxSize, core.image.wmf_ext_text_out.parse(syntheticRecord(0x0a32, 11, ext_bytes[0..16]), .absent));

    const rect_bytes = [_]u8{ 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 2, 0, 3, 0, 4, 0 };
    const rect_text = try core.image.wmf_ext_text_out.parse(syntheticRecord(0x0a32, 11, &rect_bytes), .from_options);
    try t.expectEqual(@as(i16, 1), rect_text.rectangle.?.left);
    try t.expectEqual(@as(i16, 4), rect_text.rectangle.?.bottom);

    var escape_bytes = [_]u8{ 15, 0, 3, 0, 1, 2, 3, 0xaa };
    const escaped = try core.image.wmf_escape.parse(syntheticRecord(0x0626, 7, &escape_bytes));
    try t.expectEqualSlices(u8, &.{ 1, 2, 3 }, escaped.data);
    try t.expectEqual(@as(?u8, 0xaa), escaped.padding);
    escape_bytes[2] = 5;
    try t.expectError(error.InvalidWmfEscapeSize, core.image.wmf_escape.parse(syntheticRecord(0x0626, 7, &escape_bytes)));
}

test "public WMF drawing audit pins point counts XY and rectangle field order" {
    const two = [_]u8{ 2, 0, 0xfe, 0xff, 3, 0, 4, 0, 0xfb, 0xff };
    const polygon = try core.image.wmf_poly_record.parse(syntheticRecord(0x0324, 8, &two), .polygon);
    try t.expectEqual(@as(usize, 2), polygon.points.count);
    const first = try polygon.points.get(0);
    const second = try polygon.points.get(1);
    try t.expectEqual(@as(i16, -2), first.x);
    try t.expectEqual(@as(i16, 3), first.y);
    try t.expectEqual(@as(i16, 4), second.x);
    try t.expectEqual(@as(i16, -5), second.y);
    try t.expectError(error.WmfPointIndexOutOfBounds, polygon.points.get(2));
    try t.expectError(error.InvalidWmfPolySize, core.image.wmf_poly_record.parse(syntheticRecord(0x0324, 7, &two), .polygon));
    const one = [_]u8{ 1, 0, 0, 0, 0, 0 };
    try t.expectError(error.InvalidWmfPolygonPointCount, core.image.wmf_poly_record.parse(syntheticRecord(0x0324, 6, &one), .polygon));
    const negative = [_]u8{ 0xff, 0xff };
    try t.expectError(error.InvalidWmfPointCount, core.image.wmf_poly_record.parse(syntheticRecord(0x0325, 4, &negative), .polyline));

    const rect_bytes = [_]u8{ 1, 0, 2, 0, 0xfd, 0xff, 0xfc, 0xff };
    const ellipse = try core.image.wmf_rect_record.parse(syntheticRecord(0x0418, 7, &rect_bytes), .ellipse);
    try t.expectEqual(@as(i16, -4), ellipse.rect.left);
    try t.expectEqual(@as(i16, -3), ellipse.rect.top);
    try t.expectEqual(@as(i16, 2), ellipse.rect.right);
    try t.expectEqual(@as(i16, 1), ellipse.rect.bottom);
    try t.expectError(error.InvalidWmfRectFunction, core.image.wmf_rect_record.parse(syntheticRecord(0x041b, 7, &rect_bytes), .ellipse));
}

test "public WMF create payload audit pins fields and mandatory validation" {
    const pen_bytes = [_]u8{ 6, 0, 0xff, 0xff, 2, 0, 1, 2, 3, 2 };
    const pen = try core.image.wmf_pen.parse(syntheticRecord(0x02fa, 8, &pen_bytes), .observed_preserve);
    try t.expectEqual(@as(i16, -1), pen.width.x);
    try t.expectEqual(@as(i16, 2), pen.width.y);
    try t.expectEqual(@as(u32, 0x02030201), pen.color.raw);
    try t.expectError(error.InvalidWmfColorReserved, core.image.wmf_pen.parse(syntheticRecord(0x02fa, 8, &pen_bytes), .specified_zero));

    var brush_bytes = [_]u8{ 2, 0, 3, 4, 5, 0, 6, 0 };
    try t.expectError(error.UnsupportedWmfHatchStyle, core.image.wmf_brush.parse(syntheticRecord(0x02fc, 7, &brush_bytes), .specified_zero));
    brush_bytes[6] = 5;
    const brush = try core.image.wmf_brush.parse(syntheticRecord(0x02fc, 7, &brush_bytes), .specified_zero);
    try t.expectEqual(@as(u16, 5), brush.hatch_raw);

    var font_bytes = [_]u8{0} ** 50;
    std.mem.writeInt(i16, font_bytes[8..10], 400, .little);
    font_bytes[10] = 2;
    try t.expectError(error.InvalidWmfFontBoolean, core.image.wmf_font.parse(syntheticRecord(0x02fb, 28, &font_bytes)));
    font_bytes[10] = 0;
    @memset(font_bytes[18..50], 'A');
    try t.expectError(error.UnterminatedWmfFaceName, core.image.wmf_font.parse(syntheticRecord(0x02fb, 28, &font_bytes)));
}

test "public WMF state audit pins YX order optional reserved and mode domains" {
    const point_bytes = [_]u8{ 0xfe, 0xff, 3, 0 };
    const point = try core.image.wmf_point_record.parse(syntheticRecord(0x0214, 5, &point_bytes), .move_to);
    try t.expectEqual(@as(i16, 3), point.point.x);
    try t.expectEqual(@as(i16, -2), point.point.y);
    try t.expectError(error.InvalidWmfPointFunction, core.image.wmf_point_record.parse(syntheticRecord(0x0213, 5, &point_bytes), .move_to));

    const short_mode = [_]u8{ 1, 0 };
    const mode = try core.image.wmf_mode_record.parse(syntheticRecord(0x0102, 4, &short_mode), .background);
    try t.expectEqual(@as(?u16, null), mode.reserved);
    const long_mode = [_]u8{ 2, 0, 0x34, 0x12 };
    const reserved = try core.image.wmf_mode_record.parse(syntheticRecord(0x0102, 5, &long_mode), .background);
    try t.expectEqual(@as(?u16, 0x1234), reserved.reserved);
    const invalid_mode = [_]u8{ 3, 0 };
    try t.expectError(error.UnsupportedWmfMode, core.image.wmf_mode_record.parse(syntheticRecord(0x0106, 4, &invalid_mode), .polygon_fill));

    const color_bytes = [_]u8{ 1, 2, 3, 2 };
    const color = try core.image.wmf_text_color.parse(syntheticRecord(0x0209, 5, &color_bytes), .observed_preserve);
    try t.expectEqual(@as(u32, 0x02030201), color.raw);
    try t.expectError(error.InvalidWmfColorReserved, core.image.wmf_text_color.parse(syntheticRecord(0x0209, 5, &color_bytes), .specified_zero));
}

test "public WMF object audit pins lowest-slot reuse and dead references" {
    const create = [_]u8{ 3, 0, 0, 0, 0xfa, 2 };
    const select_one = [_]u8{ 4, 0, 0, 0, 0x2d, 1, 1, 0 };
    const delete_zero = [_]u8{ 4, 0, 0, 0, 0xf0, 1, 0, 0 };
    const select_zero = [_]u8{ 4, 0, 0, 0, 0x2d, 1, 0, 0 };
    const bytes = create ++ create ++ select_one ++ delete_zero ++ create ++ select_zero;
    const frame: core.image.wmf_records.Summary = .{ .count = 6, .max_record_words = 4, .eof_end = bytes.len, .trailing_zero_words = 0 };
    const report = try core.image.wmf_objects.validate(t.allocator, &bytes, syntheticObjectHeader(2), frame);
    try t.expectEqual(@as(usize, 3), report.creates);
    try t.expectEqual(@as(usize, 2), report.selects);
    try t.expectEqual(@as(usize, 1), report.deletes);
    try t.expectEqual(@as(usize, 2), report.peak_live);

    const dead_select = [_]u8{ 4, 0, 0, 0, 0x2d, 1, 0, 0 };
    const dead_frame: core.image.wmf_records.Summary = .{ .count = 1, .max_record_words = 4, .eof_end = dead_select.len, .trailing_zero_words = 0 };
    try t.expectError(error.InvalidWmfObjectReference, core.image.wmf_objects.validate(t.allocator, &dead_select, syntheticObjectHeader(1), dead_frame));
    const dead_delete = [_]u8{ 4, 0, 0, 0, 0xf0, 1, 0, 0 };
    try t.expectError(error.InvalidWmfObjectDelete, core.image.wmf_objects.validate(t.allocator, &dead_delete, syntheticObjectHeader(1), dead_frame));
    const overflow = create ++ create;
    const overflow_frame: core.image.wmf_records.Summary = .{ .count = 2, .max_record_words = 3, .eof_end = overflow.len, .trailing_zero_words = 0 };
    try t.expectError(error.WmfObjectTableFull, core.image.wmf_objects.validate(t.allocator, &overflow, syntheticObjectHeader(1), overflow_frame));
}

test "actual placeable WMF fixed header mutations are rejected without fallback" {
    for (0..40) |cut| try t.expectError(error.UnexpectedEnd, core.image.wmf_header.parse(fixture.bytes[0..cut], .observed_payload_words));
    var bytes = fixture.bytes[0..40].* ++ fixture.bytes[40..].*;
    bytes[20] ^= 1;
    try t.expectError(error.InvalidWmfPlaceableChecksum, core.image.wmf_header.parse(&bytes, .observed_payload_words));
    bytes[20] ^= 1;
    bytes[28] ^= 1;
    try t.expectError(error.InvalidWmfSize, core.image.wmf_header.parse(&bytes, .observed_payload_words));
}

test "public WMF record audit pins malformed branches and exact trailing policy" {
    const valid = [_]u8{
        4, 0, 0, 0, 0x2d, 1, 0xaa, 0xbb,
        3, 0, 0, 0, 0,    0,
    };
    const summary = try core.image.wmf_records.validate(&valid, syntheticRecordHeader(4), .{});
    try t.expectEqual(@as(usize, 2), summary.count);
    const undersized_eof = [_]u8{ 2, 0, 0, 0, 0, 0 };
    try t.expectError(error.InvalidWmfRecordSize, core.image.wmf_records.validate(&undersized_eof, syntheticRecordHeader(2), .{}));
    const post = valid ++ [_]u8{ 3, 0, 0, 0, 1, 0 };
    try t.expectError(error.DataAfterWmfEof, core.image.wmf_records.validate(&post, syntheticRecordHeader(4), .{}));
    try t.expectError(error.InvalidWmfMaxRecord, core.image.wmf_records.validate(&valid, syntheticRecordHeader(3), .{}));
    var padded = valid ++ [_]u8{ 0, 0 };
    _ = try core.image.wmf_records.validate(&padded, syntheticRecordHeader(4), .{ .trailing_zero_words = 1 });
    padded[padded.len - 1] = 1;
    try t.expectError(error.InvalidWmfTrailingData, core.image.wmf_records.validate(&padded, syntheticRecordHeader(4), .{ .trailing_zero_words = 1 }));
}
