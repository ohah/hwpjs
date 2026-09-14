const std = @import("std");
const log_font = @import("log_font.zig");
const font_string = @import("font_string.zig");
const panose = @import("panose.zig");
const design_vector = @import("design_vector.zig");

pub const panose_size: usize = 320;
pub const ex_size: usize = 348;

pub const LogFontPanose = struct {
    font: log_font.LogFont,
    full_name: font_string.String,
    style: font_string.String,
    version: u32,
    style_size: u32,
    match: u32,
    vendor_id: *const [4]u8,
    panose_value: panose.Panose,
    padding: *const [2]u8,
};

pub const LogFontExDv = struct {
    font: log_font.LogFont,
    full_name: font_string.String,
    style: font_string.String,
    script: font_string.String,
    design: design_vector.DesignVector,
};

pub fn parsePanose(bytes: []const u8) !LogFontPanose {
    if (bytes.len != panose_size) return error.InvalidEmfLogFontPanoseSize;
    if (std.mem.readInt(u32, bytes[296..300], .little) != 0) return error.InvalidEmfLogFontPanoseReserved;
    if (std.mem.readInt(u32, bytes[304..308], .little) != 0) return error.InvalidEmfLogFontPanoseCulture;
    return .{
        .font = try log_font.parse(bytes[0..92]),
        .full_name = try font_string.parse(bytes[92..220]),
        .style = try font_string.parse(bytes[220..284]),
        .version = std.mem.readInt(u32, bytes[284..288], .little),
        .style_size = std.mem.readInt(u32, bytes[288..292], .little),
        .match = std.mem.readInt(u32, bytes[292..296], .little),
        .vendor_id = bytes[300..304],
        .panose_value = try panose.parse(bytes[308..318]),
        .padding = bytes[318..320],
    };
}

pub fn parseExDv(bytes: []const u8) !LogFontExDv {
    if (bytes.len <= panose_size or bytes.len < ex_size + design_vector.minimum_size or bytes.len > ex_size + design_vector.maximum_size)
        return error.InvalidEmfLogFontExDvSize;
    return .{
        .font = try log_font.parse(bytes[0..92]),
        .full_name = try font_string.parse(bytes[92..220]),
        .style = try font_string.parse(bytes[220..284]),
        .script = try font_string.parse(bytes[284..348]),
        .design = try design_vector.parse(bytes[348..]),
    };
}

fn initValidPanose(bytes: []u8) void {
    std.debug.assert(bytes.len == panose_size);
    @memset(bytes, 0);
    std.mem.writeInt(i32, bytes[16..20], 400, .little);
}

test "LogFontPanose preserves ignored fields and enforces specified zero fields" {
    var bytes: [panose_size]u8 = undefined;
    initValidPanose(&bytes);
    std.mem.writeInt(u32, bytes[284..288], 0xffffffff, .little);
    std.mem.writeInt(u32, bytes[292..296], 0x12345678, .little);
    bytes[300..304].* = .{ 'T', 'E', 'S', 'T' };
    bytes[318..320].* = .{ 0xaa, 0xbb };
    const value = try parsePanose(&bytes);
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.version);
    try std.testing.expectEqualSlices(u8, "TEST", value.vendor_id);
    try std.testing.expectEqualSlices(u8, &.{ 0xaa, 0xbb }, value.padding);
    std.mem.writeInt(u32, bytes[296..300], 1, .little);
    try std.testing.expectError(error.InvalidEmfLogFontPanoseReserved, parsePanose(&bytes));
    std.mem.writeInt(u32, bytes[296..300], 0, .little);
    std.mem.writeInt(u32, bytes[304..308], 1, .little);
    try std.testing.expectError(error.InvalidEmfLogFontPanoseCulture, parsePanose(&bytes));
}

test "LogFontExDv requires the complete LogFontEx and exact DesignVector" {
    var bytes = [_]u8{0} ** (ex_size + design_vector.minimum_size);
    std.mem.writeInt(i32, bytes[16..20], 400, .little);
    std.mem.writeInt(u32, bytes[348..352], design_vector.signature, .little);
    const value = try parseExDv(&bytes);
    try std.testing.expectEqual(@as(u32, 0), value.design.count);
    try std.testing.expectError(error.InvalidEmfLogFontExDvSize, parseExDv(bytes[0..355]));
    try std.testing.expectError(error.InvalidEmfLogFontExDvSize, parseExDv(bytes[0..321]));
}
