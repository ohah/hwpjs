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
}

test "public WMF create payload audit pins fields and mandatory validation" {
    const pen_bytes = [_]u8{ 6, 0, 0xff, 0xff, 2, 0, 1, 2, 3, 2 };
    const pen = try core.image.wmf_pen.parse(syntheticRecord(0x02fa, 8, &pen_bytes), .observed_preserve);
    try t.expectEqual(@as(i16, -1), pen.width_x);
    try t.expectEqual(@as(i16, 2), pen.width_y);
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
