const std = @import("std");
const t = std.testing;
const core = @import("hwpjs");
const fixture = @import("wmf_fixture");

fn syntheticHeader(max: u32) core.image.wmf_header.Header {
    return .{
        .placeable = undefined,
        .meta = .{ .metafile_type = .memory, .version = .version_300, .size_words = 0, .number_of_objects = 0, .max_record_words = max, .number_of_members = 0 },
        .records_offset = 0,
    };
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
    const summary = try core.image.wmf_records.validate(&valid, syntheticHeader(4), .{});
    try t.expectEqual(@as(usize, 2), summary.count);
    const undersized_eof = [_]u8{ 2, 0, 0, 0, 0, 0 };
    try t.expectError(error.InvalidWmfRecordSize, core.image.wmf_records.validate(&undersized_eof, syntheticHeader(2), .{}));
    const post = valid ++ [_]u8{ 3, 0, 0, 0, 1, 0 };
    try t.expectError(error.DataAfterWmfEof, core.image.wmf_records.validate(&post, syntheticHeader(4), .{}));
    try t.expectError(error.InvalidWmfMaxRecord, core.image.wmf_records.validate(&valid, syntheticHeader(3), .{}));
    var padded = valid ++ [_]u8{ 0, 0 };
    _ = try core.image.wmf_records.validate(&padded, syntheticHeader(4), .{ .trailing_zero_words = 1 });
    padded[padded.len - 1] = 1;
    try t.expectError(error.InvalidWmfTrailingData, core.image.wmf_records.validate(&padded, syntheticHeader(4), .{ .trailing_zero_words = 1 }));
}
