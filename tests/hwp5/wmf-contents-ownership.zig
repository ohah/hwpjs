const std = @import("std");
const t = std.testing;
const core = @import("hwpjs");
const fixture = @import("wmf_fixture");

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
