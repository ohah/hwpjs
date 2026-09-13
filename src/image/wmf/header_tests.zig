const std = @import("std");
const t = std.testing;
const header = @import("header.zig");

fn fixture(layout: header.SizeLayout) [46]u8 {
    var bytes = [_]u8{0} ** 46;
    std.mem.writeInt(u32, bytes[0..4], 0x9ac6cdd7, .little);
    std.mem.writeInt(i16, bytes[6..8], -2, .little);
    std.mem.writeInt(i16, bytes[8..10], 3, .little);
    std.mem.writeInt(i16, bytes[10..12], 400, .little);
    std.mem.writeInt(i16, bytes[12..14], 500, .little);
    std.mem.writeInt(u16, bytes[14..16], 1440, .little);
    var checksum: u16 = 0;
    for (0..10) |i| checksum ^= std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
    std.mem.writeInt(u16, bytes[20..22], checksum, .little);
    std.mem.writeInt(u16, bytes[22..24], 1, .little);
    std.mem.writeInt(u16, bytes[24..26], 9, .little);
    std.mem.writeInt(u16, bytes[26..28], 0x0300, .little);
    std.mem.writeInt(u32, bytes[28..32], if (layout == .specified) 12 else 3, .little);
    std.mem.writeInt(u16, bytes[32..34], 7, .little);
    std.mem.writeInt(u32, bytes[34..38], 3, .little);
    std.mem.writeInt(u16, bytes[38..40], 0, .little);
    std.mem.writeInt(u32, bytes[40..44], 3, .little);
    return bytes;
}

test "placeable WMF header keeps fields and requires explicit size layout" {
    for ([_]header.SizeLayout{ .specified, .observed_payload_words }) |layout| {
        const bytes = fixture(layout);
        const value = try header.parse(&bytes, layout);
        try t.expectEqual(@as(usize, 40), value.records_offset);
        try t.expectEqual(@as(i16, -2), value.placeable.bounds.left);
        try t.expectEqual(@as(i16, 500), value.placeable.bounds.bottom);
        try t.expectEqual(@as(u16, 1440), value.placeable.inch);
        try t.expectEqual(header.MetafileType.memory, value.meta.metafile_type);
        try t.expectEqual(header.Version.version_300, value.meta.version);
        try t.expectEqual(@as(u16, 7), value.meta.number_of_objects);
        try t.expectEqual(@as(u32, 3), value.meta.max_record_words);
        try t.expectError(error.InvalidWmfSize, header.parse(&bytes, if (layout == .specified) .observed_payload_words else .specified));
    }
}

test "placeable WMF header rejects every cut and malformed fixed field" {
    const original = fixture(.specified);
    for (0..40) |cut| try t.expectError(error.UnexpectedEnd, header.parse(original[0..cut], .specified));
    const Case = struct { offset: usize, value: u8, expected: anyerror };
    for ([_]Case{
        .{ .offset = 0, .value = 0, .expected = error.InvalidWmfPlaceableKey },
        .{ .offset = 16, .value = 1, .expected = error.InvalidWmfPlaceableReserved },
        .{ .offset = 20, .value = 0, .expected = error.InvalidWmfPlaceableChecksum },
        .{ .offset = 22, .value = 3, .expected = error.UnsupportedWmfMetafileType },
        .{ .offset = 24, .value = 8, .expected = error.InvalidWmfHeaderSize },
        .{ .offset = 26, .value = 2, .expected = error.UnsupportedWmfVersion },
        .{ .offset = 28, .value = 0, .expected = error.InvalidWmfSize },
    }) |case| {
        var bytes = original;
        bytes[case.offset] = case.value;
        try t.expectError(case.expected, header.parse(&bytes, .specified));
    }
    var odd: [47]u8 = undefined;
    @memcpy(odd[0..46], &original);
    odd[46] = 0;
    try t.expectError(error.InvalidWmfSize, header.parse(&odd, .specified));
}

test "disk placeable WMF requires a zero handle and preserves advisory members" {
    var bytes = fixture(.specified);
    std.mem.writeInt(u16, bytes[22..24], 2, .little);
    std.mem.writeInt(u16, bytes[38..40], 9, .little);
    const value = try header.parse(&bytes, .specified);
    try t.expectEqual(@as(u16, 9), value.meta.number_of_members);
    std.mem.writeInt(u16, bytes[4..6], 1, .little);
    var checksum: u16 = 0;
    for (0..10) |i| checksum ^= std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
    std.mem.writeInt(u16, bytes[20..22], checksum, .little);
    try t.expectError(error.InvalidWmfPlaceableHandle, header.parse(&bytes, .specified));
}
