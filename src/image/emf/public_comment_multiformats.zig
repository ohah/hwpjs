const std = @import("std");
const geometry = @import("geometry.zig");
const emr_format = @import("emr_format.zig");

pub const MultiFormats = struct {
    output_rectangle: geometry.RectL,
    count_formats: u32,
    descriptors: []const u8,
    format_data: []const u8,
    body: []const u8,
    enhanced_metafiles: usize,
    encapsulated_postscript: usize,
    unknown_formats: usize,

    pub fn iterator(self: MultiFormats) Iterator {
        return .{ .value = self };
    }
};

pub const Iterator = struct {
    value: MultiFormats,
    index: usize = 0,
    data_offset: usize = 0,

    pub fn next(self: *Iterator) !?emr_format.Format {
        if (self.index == self.value.count_formats) return null;
        const descriptor_offset = std.math.mul(usize, self.index, emr_format.size) catch
            return error.InvalidEmrFormatArrayExtent;
        const body_data_start = 20 + self.value.descriptors.len;
        const expected_offset = std.math.add(usize, body_data_start, self.data_offset) catch
            return error.InvalidEmrFormatDataExtent;
        const value = try emr_format.parse(
            self.value.descriptors[descriptor_offset..][0..emr_format.size],
            self.value.body,
            expected_offset,
        );
        self.data_offset = std.math.add(usize, self.data_offset, value.size_data) catch
            return error.InvalidEmrFormatDataExtent;
        self.index += 1;
        return value;
    }
};

pub fn parse(body: []const u8) !MultiFormats {
    if (body.len < 20) return error.TruncatedEmfPublicMultiFormats;
    const count_formats = std.mem.readInt(u32, body[16..20], .little);
    const descriptor_bytes_u64 = @as(u64, count_formats) * emr_format.size;
    if (descriptor_bytes_u64 > body.len - 20) return error.TruncatedEmrFormatArray;
    const descriptor_bytes: usize = @intCast(descriptor_bytes_u64);
    const data_start = 20 + descriptor_bytes;
    var value: MultiFormats = .{
        .output_rectangle = try geometry.parseRectL(body[0..16]),
        .count_formats = count_formats,
        .descriptors = body[20..data_start],
        .format_data = body[data_start..],
        .body = body,
        .enhanced_metafiles = 0,
        .encapsulated_postscript = 0,
        .unknown_formats = 0,
    };
    var iterator = value.iterator();
    while (try iterator.next()) |format| {
        if (format.signature) |known| switch (known) {
            .enhanced_metafile => value.enhanced_metafiles += 1,
            .encapsulated_postscript => value.encapsulated_postscript += 1,
        } else value.unknown_formats += 1;
    }
    if (iterator.data_offset != value.format_data.len) return error.InvalidEmrFormatDataSize;
    return value;
}

test "MULTIFORMATS parses ordered exact contiguous format data without allocation" {
    var body = [_]u8{0} ** 59;
    std.mem.writeInt(i32, body[0..4], -1, .little);
    std.mem.writeInt(u32, body[16..20], 2, .little);
    std.mem.writeInt(u32, body[20..24], @intFromEnum(emr_format.Signature.enhanced_metafile), .little);
    std.mem.writeInt(u32, body[28..32], 5, .little);
    std.mem.writeInt(u32, body[32..36], 60, .little);
    std.mem.writeInt(u32, body[36..40], @intFromEnum(emr_format.Signature.encapsulated_postscript), .little);
    std.mem.writeInt(u32, body[40..44], 1, .little);
    std.mem.writeInt(u32, body[44..48], 4, .little);
    std.mem.writeInt(u32, body[48..52], 63, .little);
    // The second offset is intentionally unaligned first.
    try std.testing.expectError(error.UnalignedEmrFormatData, parse(&body));
    // Contiguous data cannot begin at an unaligned offset after three bytes;
    // make the first image four bytes and the whole payload one byte longer.
    var aligned = [_]u8{0} ** 60;
    aligned[0..52].* = body[0..52].*;
    std.mem.writeInt(u32, aligned[28..32], 4, .little);
    std.mem.writeInt(u32, aligned[48..52], 64, .little);
    aligned[52..60].* = .{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const value = try parse(&aligned);
    try std.testing.expectEqual(@as(i32, -1), value.output_rectangle.left);
    try std.testing.expectEqual(@as(u32, 2), value.count_formats);
    try std.testing.expectEqual(@as(usize, 1), value.enhanced_metafiles);
    try std.testing.expectEqual(@as(usize, 1), value.encapsulated_postscript);
    try std.testing.expectEqual(@as(usize, 0), value.unknown_formats);
    var iterator = value.iterator();
    const first = (try iterator.next()).?;
    const second = (try iterator.next()).?;
    try std.testing.expectEqualSlices(u8, aligned[52..56], first.data);
    try std.testing.expectEqualSlices(u8, aligned[56..60], second.data);
    try std.testing.expect((try iterator.next()) == null);
}

test "MULTIFORMATS preserves a structurally valid vendor format" {
    var body = [_]u8{0} ** 40;
    std.mem.writeInt(u32, body[16..20], 1, .little);
    std.mem.writeInt(u32, body[20..24], 0x50444620, .little);
    std.mem.writeInt(u32, body[24..28], 0, .little);
    std.mem.writeInt(u32, body[28..32], 4, .little);
    std.mem.writeInt(u32, body[32..36], 44, .little);
    body[36..40].* = .{ 1, 2, 3, 4 };
    const value = try parse(&body);
    try std.testing.expectEqual(@as(usize, 1), value.unknown_formats);
    var iterator = value.iterator();
    const format = (try iterator.next()).?;
    try std.testing.expectEqual(@as(u32, 0x50444620), format.signature_raw);
    try std.testing.expectEqual(@as(?emr_format.Signature, null), format.signature);
    try std.testing.expectEqualSlices(u8, body[36..40], format.data);
}

test "MULTIFORMATS rejects every fixed-prefix truncation count overflow gaps overlap and trailing data" {
    var minimal = [_]u8{0} ** 20;
    for (0..20) |cut| try std.testing.expectError(error.TruncatedEmfPublicMultiFormats, parse(minimal[0..cut]));
    _ = try parse(&minimal);
    var one = [_]u8{0} ** 36;
    std.mem.writeInt(u32, one[16..20], 1, .little);
    for (20..36) |cut| try std.testing.expectError(error.TruncatedEmrFormatArray, parse(one[0..cut]));
    std.mem.writeInt(u32, minimal[16..20], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.TruncatedEmrFormatArray, parse(&minimal));

    var body = [_]u8{0} ** 40;
    std.mem.writeInt(u32, body[16..20], 1, .little);
    std.mem.writeInt(u32, body[20..24], @intFromEnum(emr_format.Signature.enhanced_metafile), .little);
    std.mem.writeInt(u32, body[32..36], 40, .little);
    try std.testing.expectError(error.InvalidEmrFormatDataOffset, parse(&body));
    std.mem.writeInt(u32, body[32..36], 44, .little); // correct: body 36 + identifier pair 8
    std.mem.writeInt(u32, body[28..32], 5, .little);
    try std.testing.expectError(error.InvalidEmrFormatDataExtent, parse(&body));
    std.mem.writeInt(u32, body[28..32], 0, .little);
    try std.testing.expectError(error.InvalidEmrFormatDataSize, parse(&body));
}
