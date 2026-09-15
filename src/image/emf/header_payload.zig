const std = @import("std");
const records = @import("records.zig");
const header = @import("header.zig");
const pixel_format = @import("pixel_format.zig");
const utf16 = @import("../../text/utf16.zig");

pub const Variant = enum { base, extension1, extension2 };
pub const Extension1 = struct { pixel_format: ?pixel_format.Descriptor, open_gl: bool };
pub const Extension2 = struct { micrometers: header.SizeL };
pub const Payload = struct {
    variant: Variant,
    fixed_size: usize,
    description_utf16le: ?[]const u8,
    extension1: ?Extension1,
    extension2: ?Extension2,
};
pub const Parsed = struct { header: header.Header, payload: Payload };

fn range(bytes: []const u8, offset: u32, size: u64, minimum: usize, invalid: anyerror) ![]const u8 {
    if (offset < minimum or size > std.math.maxInt(usize)) return invalid;
    const start: usize = offset;
    const count: usize = @intCast(size);
    if (start > bytes.len) return invalid;
    if (count > bytes.len - start) return invalid;
    return bytes[start .. start + count];
}

pub fn parse(record: records.Record, stream_size: usize) !Parsed {
    const base = try header.parse(record, stream_size);
    return .{ .header = base, .payload = try parsePayload(record, base) };
}

fn parsePayload(record: records.Record, base: header.Header) !Payload {
    var header_size: usize = record.bytes.len;
    var description: ?[]const u8 = null;
    if (base.description_characters != 0 and base.description_offset != 0) {
        const byte_count = @as(u64, base.description_characters) * 2;
        const bytes = try range(record.bytes, base.description_offset, byte_count, 88, error.InvalidEmfDescriptionRange);
        if (std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .little) != 0)
            return error.MissingEmfDescriptionTerminator;
        _ = try utf16.inspect(bytes, .little);
        description = bytes;
        header_size = base.description_offset;
    }

    var extension1: ?Extension1 = null;
    if (header_size >= 100) {
        const pixel_size = std.mem.readInt(u32, record.bytes[88..92], .little);
        const pixel_offset = std.mem.readInt(u32, record.bytes[92..96], .little);
        const open_gl = std.mem.readInt(u32, record.bytes[96..100], .little);
        if (open_gl > 1) return error.InvalidEmfOpenGlFlag;
        var descriptor: ?pixel_format.Descriptor = null;
        if (pixel_size != 0 and pixel_offset != 0) {
            const bytes = try range(record.bytes, pixel_offset, pixel_size, 100, error.InvalidEmfPixelFormatRange);
            descriptor = try pixel_format.parse(bytes);
            header_size = @min(header_size, @as(usize, pixel_offset));
        }
        extension1 = .{ .pixel_format = descriptor, .open_gl = open_gl == 1 };
    }

    const variant: Variant = if (header_size >= 108) .extension2 else if (header_size >= 100) .extension1 else .base;
    const fixed_size: usize = switch (variant) {
        .base => 88,
        .extension1 => 100,
        .extension2 => 108,
    };
    if (description) |bytes| if (base.description_offset < fixed_size or base.description_offset + bytes.len > record.bytes.len)
        return error.InvalidEmfDescriptionRange;
    if (extension1) |value| if (value.pixel_format) |descriptor| if (std.mem.readInt(u32, record.bytes[92..96], .little) < fixed_size or
        std.mem.readInt(u32, record.bytes[92..96], .little) + descriptor.raw.len > record.bytes.len)
        return error.InvalidEmfPixelFormatRange;

    return .{
        .variant = variant,
        .fixed_size = fixed_size,
        .description_utf16le = description,
        .extension1 = if (variant == .base) null else extension1,
        .extension2 = if (variant == .extension2) .{ .micrometers = .{
            .width = std.mem.readInt(i32, record.bytes[100..104], .little),
            .height = std.mem.readInt(i32, record.bytes[104..108], .little),
        } } else null,
    };
}

fn fixture(bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = .header, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "Header payload owns base parsing and exact fixed-size thresholds" {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[40..44], 0x464d4520, .little);
    for ([_]struct { size: usize, variant: Variant }{
        .{ .size = 88, .variant = .base },
        .{ .size = 92, .variant = .base },
        .{ .size = 96, .variant = .base },
        .{ .size = 100, .variant = .extension1 },
        .{ .size = 104, .variant = .extension1 },
        .{ .size = 108, .variant = .extension2 },
    }) |case| {
        std.mem.writeInt(u32, bytes[48..52], @intCast(case.size), .little);
        const parsed = try parse(fixture(bytes[0..case.size]), case.size);
        try std.testing.expectEqual(case.variant, parsed.payload.variant);
        try std.testing.expectEqual(@as(u32, @intCast(case.size)), parsed.header.bytes);
    }

    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    var mismatched = fixture(&bytes);
    mismatched.size -= 4;
    try std.testing.expectError(error.InvalidEmfHeaderSize, parse(mismatched, bytes.len));
    try std.testing.expectError(error.InvalidEmfDeclaredBytes, parse(fixture(&bytes), bytes.len + 4));
}

test "pixel format before description determines the extension boundary" {
    var bytes = [_]u8{0} ** 156;
    std.mem.writeInt(u32, bytes[40..44], 0x464d4520, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[60..64], 2, .little);
    std.mem.writeInt(u32, bytes[64..68], 152, .little);
    std.mem.writeInt(u32, bytes[88..92], pixel_format.byte_size, .little);
    std.mem.writeInt(u32, bytes[92..96], 100, .little);
    std.mem.writeInt(u16, bytes[100..102], pixel_format.byte_size, .little);
    std.mem.writeInt(u16, bytes[102..104], 1, .little);
    bytes[152] = 'x';
    bytes[153] = 0;

    const parsed = try parse(fixture(&bytes), bytes.len);
    try std.testing.expectEqual(Variant.extension1, parsed.payload.variant);
    try std.testing.expectEqual(@as(usize, 100), parsed.payload.fixed_size);
    try std.testing.expect(parsed.payload.extension1.?.pixel_format != null);
    try std.testing.expect(parsed.payload.extension2 == null);
    try std.testing.expectEqualSlices(u8, bytes[152..156], parsed.payload.description_utf16le.?);
}

test "Header payload treats incomplete optional pairs as absent per HeaderSize flow" {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[40..44], 0x464d4520, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[60..64], 1, .little);
    const missing_description_offset = try parse(fixture(&bytes), bytes.len);
    try std.testing.expect(missing_description_offset.payload.description_utf16le == null);
    try std.testing.expectEqual(Variant.extension2, missing_description_offset.payload.variant);

    std.mem.writeInt(u32, bytes[60..64], 0, .little);
    std.mem.writeInt(u32, bytes[64..68], 88, .little);
    std.mem.writeInt(u32, bytes[88..92], pixel_format.byte_size, .little);
    const missing_pixel_offset = try parse(fixture(&bytes), bytes.len);
    try std.testing.expect(missing_pixel_offset.payload.description_utf16le == null);
    try std.testing.expect(missing_pixel_offset.payload.extension1.?.pixel_format == null);
}
