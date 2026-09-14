const std = @import("std");
const text_utf16 = @import("../../text/utf16.zig");
const values = @import("color_space_values.zig");

pub const signature: u32 = 0x50534f43;
pub const version: u32 = 0x00000400;
pub const core_size: usize = 68;
pub const ansi_size: usize = core_size + 260;
pub const wide_size: usize = core_size + 520;

pub const Core = struct {
    color_space: values.LogicalColorSpace,
    intent: values.GamutMappingIntent,
    /// Nine borrowed 2.30 fixed-point words in red, green, blue XYZ order.
    endpoints: [9]u32,
    gamma: [3]u32,
};

pub const Ansi = struct {
    core: Core,
    /// Borrowed bytes before the first NUL, or all 260 bytes if no NUL exists.
    filename: []const u8,
    filename_storage: []const u8,
};

pub const Wide = struct {
    core: Core,
    /// Borrowed UTF-16LE bytes before the required first NUL code unit.
    filename: []const u8,
    filename_storage: []const u8,
};

fn parseCore(bytes: []const u8, expected_size: usize) !Core {
    if (bytes.len != expected_size) return error.InvalidEmfLogColorSpaceSize;
    if (std.mem.readInt(u32, bytes[0..4], .little) != signature) return error.InvalidEmfLogColorSpaceSignature;
    if (std.mem.readInt(u32, bytes[4..8], .little) != version) return error.InvalidEmfLogColorSpaceVersion;
    if (std.mem.readInt(u32, bytes[8..12], .little) != expected_size) return error.InvalidEmfLogColorSpaceDeclaredSize;
    var endpoints: [9]u32 = undefined;
    for (&endpoints, 0..) |*value, index|
        value.* = std.mem.readInt(u32, bytes[20 + index * 4 ..][0..4], .little);
    var gamma: [3]u32 = undefined;
    for (&gamma, 0..) |*value, index|
        value.* = std.mem.readInt(u32, bytes[56 + index * 4 ..][0..4], .little);
    return .{
        .color_space = try values.logical(std.mem.readInt(u32, bytes[12..16], .little)),
        .intent = try values.intent(std.mem.readInt(u32, bytes[16..20], .little)),
        .endpoints = endpoints,
        .gamma = gamma,
    };
}

pub fn parseAnsi(bytes: []const u8) !Ansi {
    const core = try parseCore(bytes, ansi_size);
    const storage = bytes[core_size..];
    const end = std.mem.indexOfScalar(u8, storage, 0) orelse storage.len;
    for (storage[0..end]) |value| if (value > 0x7f) return error.InvalidEmfLogColorSpaceAscii;
    return .{ .core = core, .filename = storage[0..end], .filename_storage = storage };
}

pub fn parseWide(bytes: []const u8) !Wide {
    const core = try parseCore(bytes, wide_size);
    const storage = bytes[core_size..];
    var end: ?usize = null;
    var offset: usize = 0;
    while (offset < storage.len) : (offset += 2) {
        if (std.mem.readInt(u16, storage[offset..][0..2], .little) == 0) {
            end = offset;
            break;
        }
    }
    const filename_end = end orelse return error.UnterminatedEmfLogColorSpaceFilename;
    _ = try text_utf16.inspect(storage[0 .. filename_end + 2], .little);
    return .{ .core = core, .filename = storage[0..filename_end], .filename_storage = storage };
}

fn initValid(bytes: []u8) void {
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], signature, .little);
    std.mem.writeInt(u32, bytes[4..8], version, .little);
    std.mem.writeInt(u32, bytes[8..12], @intCast(bytes.len), .little);
    std.mem.writeInt(u32, bytes[12..16], @intFromEnum(values.LogicalColorSpace.srgb), .little);
    std.mem.writeInt(u32, bytes[16..20], @intFromEnum(values.GamutMappingIntent.images), .little);
}

test "ANSI log color space preserves raw fixed-point fields and filename storage" {
    var bytes: [ansi_size]u8 = undefined;
    initValid(&bytes);
    std.mem.writeInt(u32, bytes[20..24], 0x80000000, .little);
    std.mem.writeInt(u32, bytes[64..68], 0x12345678, .little);
    @memcpy(bytes[68..72], "x.ic");
    bytes[72] = 'c';
    const parsed = try parseAnsi(&bytes);
    try std.testing.expectEqual(@as(u32, 0x80000000), parsed.core.endpoints[0]);
    try std.testing.expectEqual(@as(u32, 0x12345678), parsed.core.gamma[2]);
    try std.testing.expectEqualStrings("x.icc", parsed.filename);
    try std.testing.expectEqual(@as(usize, 260), parsed.filename_storage.len);
}

test "wide log color space validates only the terminated UTF-16 filename" {
    var bytes: [wide_size]u8 = undefined;
    initValid(&bytes);
    std.mem.writeInt(u16, bytes[68..70], 0xd83d, .little);
    std.mem.writeInt(u16, bytes[70..72], 0xde00, .little);
    std.mem.writeInt(u16, bytes[72..74], 0, .little);
    std.mem.writeInt(u16, bytes[74..76], 0xd800, .little);
    const parsed = try parseWide(&bytes);
    try std.testing.expectEqual(@as(usize, 4), parsed.filename.len);
    try std.testing.expectEqual(@as(usize, 520), parsed.filename_storage.len);
    std.mem.writeInt(u16, bytes[70..72], 0, .little);
    try std.testing.expectError(error.InvalidUnicodeEncoding, parseWide(&bytes));
}

test "log color spaces reject every structural field boundary" {
    var ansi: [ansi_size]u8 = undefined;
    initValid(&ansi);
    try std.testing.expectError(error.InvalidEmfLogColorSpaceSize, parseAnsi(ansi[0 .. ansi.len - 1]));
    ansi[0] ^= 1;
    try std.testing.expectError(error.InvalidEmfLogColorSpaceSignature, parseAnsi(&ansi));
    initValid(&ansi);
    ansi[4] ^= 1;
    try std.testing.expectError(error.InvalidEmfLogColorSpaceVersion, parseAnsi(&ansi));
    initValid(&ansi);
    std.mem.writeInt(u32, ansi[8..12], ansi.len - 1, .little);
    try std.testing.expectError(error.InvalidEmfLogColorSpaceDeclaredSize, parseAnsi(&ansi));
    initValid(&ansi);
    std.mem.writeInt(u32, ansi[12..16], 1, .little);
    try std.testing.expectError(error.InvalidEmfLogicalColorSpace, parseAnsi(&ansi));
    initValid(&ansi);
    std.mem.writeInt(u32, ansi[16..20], 3, .little);
    try std.testing.expectError(error.InvalidEmfGamutMappingIntent, parseAnsi(&ansi));
    initValid(&ansi);
    ansi[68] = 0x80;
    try std.testing.expectError(error.InvalidEmfLogColorSpaceAscii, parseAnsi(&ansi));
    var wide: [wide_size]u8 = undefined;
    initValid(&wide);
    @memset(wide[68..], 1);
    try std.testing.expectError(error.UnterminatedEmfLogColorSpaceFilename, parseWide(&wide));
}

test "ANSI filename rejects every non-ASCII byte before but not after NUL" {
    var bytes: [ansi_size]u8 = undefined;
    for (128..256) |value| {
        initValid(&bytes);
        bytes[68] = @intCast(value);
        try std.testing.expectError(error.InvalidEmfLogColorSpaceAscii, parseAnsi(&bytes));
        bytes[68] = 0;
        bytes[69] = @intCast(value);
        _ = try parseAnsi(&bytes);
    }
}

test "wide filename accepts a terminator at the final code unit" {
    var bytes: [wide_size]u8 = undefined;
    initValid(&bytes);
    for (68..bytes.len - 2) |index| bytes[index] = if (index % 2 == 0) 1 else 0;
    const parsed = try parseWide(&bytes);
    try std.testing.expectEqual(@as(usize, 518), parsed.filename.len);
}
