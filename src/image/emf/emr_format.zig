const std = @import("std");

pub const size = 16;

pub const Signature = enum(u32) {
    enhanced_metafile = 0x464d4520,
    encapsulated_postscript = 0x46535045,
};

pub const Format = struct {
    signature_raw: u32,
    signature: ?Signature,
    version: u32,
    size_data: u32,
    offset_data: u32,
    data: []const u8,
};

pub fn parse(descriptor: []const u8, public_body: []const u8, expected_body_offset: usize) !Format {
    if (descriptor.len != size) return error.InvalidEmrFormatSize;
    const signature_raw = std.mem.readInt(u32, descriptor[0..4], .little);
    const signature = std.enums.fromInt(Signature, signature_raw);
    const version = std.mem.readInt(u32, descriptor[4..8], .little);
    if (signature == Signature.encapsulated_postscript and version != 1) return error.UnsupportedEmrEpsVersion;
    const size_data = std.mem.readInt(u32, descriptor[8..12], .little);
    const offset_data = std.mem.readInt(u32, descriptor[12..16], .little);
    if (offset_data % 4 != 0) return error.UnalignedEmrFormatData;

    // offData is measured from CommentIdentifier. public_body begins after both
    // CommentIdentifier and PublicCommentIdentifier, eight bytes later.
    const expected_comment_offset = std.math.add(usize, expected_body_offset, 8) catch return error.InvalidEmrFormatDataExtent;
    if (expected_comment_offset > std.math.maxInt(u32) or offset_data != expected_comment_offset)
        return error.InvalidEmrFormatDataOffset;
    const data_end = std.math.add(usize, expected_body_offset, size_data) catch return error.InvalidEmrFormatDataExtent;
    if (data_end > public_body.len) return error.InvalidEmrFormatDataExtent;
    return .{
        .signature_raw = signature_raw,
        .signature = signature,
        .version = version,
        .size_data = size_data,
        .offset_data = offset_data,
        .data = public_body[expected_body_offset..data_end],
    };
}

test "EmrFormat preserves signatures versions extents and exact borrowed data" {
    var body = [_]u8{0xa5} ** 28;
    var descriptor = [_]u8{0} ** size;
    std.mem.writeInt(u32, descriptor[0..4], @intFromEnum(Signature.enhanced_metafile), .little);
    std.mem.writeInt(u32, descriptor[4..8], 0xffffffff, .little);
    std.mem.writeInt(u32, descriptor[8..12], 4, .little);
    std.mem.writeInt(u32, descriptor[12..16], 32, .little);
    const value = try parse(&descriptor, &body, 24);
    try std.testing.expectEqual(@as(u32, @intFromEnum(Signature.enhanced_metafile)), value.signature_raw);
    try std.testing.expectEqual(Signature.enhanced_metafile, value.signature.?);
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.version);
    try std.testing.expectEqualSlices(u8, body[24..28], value.data);
}

test "EmrFormat preserves extension signatures and rejects invalid EPS versions offsets and extents" {
    var descriptor = [_]u8{0} ** size;
    var body = [_]u8{0} ** 24;
    std.mem.writeInt(u32, descriptor[12..16], 32, .little);
    const extension = try parse(&descriptor, &body, 24);
    try std.testing.expectEqual(@as(?Signature, null), extension.signature);
    try std.testing.expectEqual(@as(u32, 0), extension.signature_raw);
    std.mem.writeInt(u32, descriptor[0..4], @intFromEnum(Signature.encapsulated_postscript), .little);
    try std.testing.expectError(error.UnsupportedEmrEpsVersion, parse(&descriptor, &body, 24));
    std.mem.writeInt(u32, descriptor[4..8], 1, .little);
    std.mem.writeInt(u32, descriptor[12..16], 31, .little);
    try std.testing.expectError(error.UnalignedEmrFormatData, parse(&descriptor, &body, 24));
    std.mem.writeInt(u32, descriptor[12..16], 36, .little);
    try std.testing.expectError(error.InvalidEmrFormatDataOffset, parse(&descriptor, &body, 24));
    std.mem.writeInt(u32, descriptor[12..16], 32, .little);
    std.mem.writeInt(u32, descriptor[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmrFormatDataExtent, parse(&descriptor, &body, 24));
    try std.testing.expectError(error.InvalidEmrFormatSize, parse(descriptor[0..15], &body, 24));
}
