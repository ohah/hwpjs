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

fn range(bytes: []const u8, offset: u32, size: u64, minimum: usize, invalid: anyerror) ![]const u8 {
    if (offset < minimum or size > std.math.maxInt(usize)) return invalid;
    const start: usize = offset;
    const count: usize = @intCast(size);
    if (start > bytes.len) return invalid;
    if (count > bytes.len - start) return invalid;
    return bytes[start .. start + count];
}

pub fn parse(record: records.Record, base: header.Header) !Payload {
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
            if (pixel_size != 40) return error.InvalidEmfPixelFormatSize;
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
