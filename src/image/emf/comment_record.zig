const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const comment_identifier = @import("comment_identifier.zig");

pub const minimum_size = 12;

pub const Classification = enum {
    private,
    emf_plus,
    emf_spool,
    public,
};

pub const Comment = struct {
    data_size: u32,
    data: []const u8,
    leading_dword: ?u32,
    identifier: ?comment_identifier.Identifier,
    classification: Classification,
    parameters: []const u8,
    alignment_padding: []const u8,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?Comment {
    if (record.kind != .comment) return null;
    _ = record_extent.requiredEnd(record, minimum_size) orelse return error.InvalidEmfCommentRecordSize;

    const data_size = std.mem.readInt(u32, record.bytes[8..12], .little);
    const data_end_u64 = @as(u64, minimum_size) + data_size;
    if (data_end_u64 > record.bytes.len) return error.InvalidEmfCommentDataSize;
    const data_end: usize = @intCast(data_end_u64);
    const padding_len = (4 - data_end % 4) % 4;
    if (padding_len > record.bytes.len - data_end) return error.InvalidEmfCommentPadding;
    const payload = record.bytes[minimum_size..data_end];
    const padding_end = data_end + padding_len;

    const leading_dword = if (payload.len >= 4) std.mem.readInt(u32, payload[0..4], .little) else null;
    const identifier = if (leading_dword) |raw| comment_identifier.parse(raw) else null;
    const classification: Classification = if (identifier) |known| switch (known) {
        .emf_plus => .emf_plus,
        .emf_spool => .emf_spool,
        .public => .public,
    } else .private;
    return .{
        .data_size = data_size,
        .data = payload,
        .leading_dword = leading_dword,
        .identifier = identifier,
        .classification = classification,
        .parameters = if (identifier != null) payload[4..] else payload,
        .alignment_padding = record.bytes[data_end..padding_end],
        .trailing_data = record.bytes[padding_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "COMMENT classifies predefined identifiers and preserves exact payload boundaries" {
    const cases = [_]struct { raw: u32, expected: Classification }{
        .{ .raw = 0x00000000, .expected = .emf_spool },
        .{ .raw = 0x2b464d45, .expected = .emf_plus },
        .{ .raw = 0x43494447, .expected = .public },
    };
    for (cases) |case| {
        var bytes = [_]u8{0} ** 20;
        std.mem.writeInt(u32, bytes[8..12], 5, .little);
        std.mem.writeInt(u32, bytes[12..16], case.raw, .little);
        bytes[16] = 0xa5;
        bytes[17..20].* = .{ 0xde, 0xad, 0xbe };
        const value = (try parse(fixture(.comment, &bytes))) orelse return error.TestExpectedEqual;
        try std.testing.expectEqual(@as(u32, 5), value.data_size);
        try std.testing.expectEqual(case.expected, value.classification);
        try std.testing.expectEqual(case.raw, value.leading_dword.?);
        try std.testing.expectEqual(case.raw, @intFromEnum(value.identifier.?));
        try std.testing.expectEqualSlices(u8, bytes[12..17], value.data);
        try std.testing.expectEqualSlices(u8, bytes[16..17], value.parameters);
        try std.testing.expectEqualSlices(u8, bytes[17..20], value.alignment_padding);
        try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);
    }
}

test "COMMENT keeps absent short and unknown private data distinct" {
    var empty = [_]u8{0} ** 12;
    const no_data = (try parse(fixture(.comment, &empty))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(Classification.private, no_data.classification);
    try std.testing.expectEqual(@as(?u32, null), no_data.leading_dword);
    try std.testing.expectEqual(@as(?comment_identifier.Identifier, null), no_data.identifier);
    try std.testing.expectEqual(@as(usize, 0), no_data.data.len);

    var short = [_]u8{0} ** 16;
    std.mem.writeInt(u32, short[8..12], 3, .little);
    short[12..15].* = .{ 1, 2, 3 };
    short[15] = 0xcc;
    const short_private = (try parse(fixture(.comment, &short))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(@as(?u32, null), short_private.leading_dword);
    try std.testing.expectEqualSlices(u8, short[12..15], short_private.parameters);
    try std.testing.expectEqualSlices(u8, short[15..16], short_private.alignment_padding);

    var unknown = [_]u8{0} ** 20;
    std.mem.writeInt(u32, unknown[8..12], 8, .little);
    std.mem.writeInt(u32, unknown[12..16], 0x11223344, .little);
    unknown[16..20].* = .{ 5, 6, 7, 8 };
    const private = (try parse(fixture(.comment, &unknown))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(Classification.private, private.classification);
    try std.testing.expectEqual(@as(u32, 0x11223344), private.leading_dword.?);
    try std.testing.expectEqual(@as(?comment_identifier.Identifier, null), private.identifier);
    try std.testing.expectEqualSlices(u8, unknown[12..20], private.parameters);
}

test "COMMENT separates alignment padding from common record extensions" {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[8..12], 5, .little);
    std.mem.writeInt(u32, bytes[12..16], 0x43494447, .little);
    bytes[16] = 7;
    bytes[17..20].* = .{ 1, 2, 3 };
    bytes[20..24].* = .{ 4, 5, 6, 7 };
    const value = (try parse(fixture(.comment, &bytes))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqualSlices(u8, bytes[17..20], value.alignment_padding);
    try std.testing.expectEqualSlices(u8, bytes[20..24], value.trailing_data);
}

test "COMMENT covers every DataSize alignment residue before record extensions" {
    for (0..8) |data_size| {
        var bytes = [_]u8{0xa5} ** 24;
        std.mem.writeInt(u32, bytes[8..12], @intCast(data_size), .little);
        const data_end = minimum_size + data_size;
        const padding_len = (4 - data_end % 4) % 4;
        const record_end = data_end + padding_len + 4;
        const value = (try parse(fixture(.comment, bytes[0..record_end]))) orelse return error.TestExpectedEqual;
        try std.testing.expectEqual(@as(u32, @intCast(data_size)), value.data_size);
        try std.testing.expectEqualSlices(u8, bytes[minimum_size..data_end], value.data);
        try std.testing.expectEqualSlices(u8, bytes[data_end .. data_end + padding_len], value.alignment_padding);
        try std.testing.expectEqualSlices(u8, bytes[data_end + padding_len .. record_end], value.trailing_data);
    }
}

test "COMMENT rejects every truncated prefix and inconsistent extent" {
    var bytes = [_]u8{0} ** minimum_size;
    for (0..minimum_size) |cut|
        try std.testing.expectError(error.InvalidEmfCommentRecordSize, parse(fixture(.comment, bytes[0..cut])));

    var declared_short = fixture(.comment, &bytes);
    declared_short.size -= 4;
    try std.testing.expectError(error.InvalidEmfCommentRecordSize, parse(declared_short));
    var declared_long = fixture(.comment, &bytes);
    declared_long.size += 4;
    try std.testing.expectError(error.InvalidEmfCommentRecordSize, parse(declared_long));

    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmfCommentDataSize, parse(fixture(.comment, &bytes)));
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfCommentDataSize, parse(fixture(.comment, &bytes)));
    var missing_padding = [_]u8{0} ** 13;
    std.mem.writeInt(u32, missing_padding[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmfCommentPadding, parse(fixture(.comment, &missing_padding)));
    try std.testing.expect((try parse(fixture(.savedc, &bytes))) == null);
}
