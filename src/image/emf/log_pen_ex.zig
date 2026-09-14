const std = @import("std");
const brush_style = @import("brush_style.zig");
const color_ref = @import("../wmf/color_ref.zig");
const color_usage = @import("color_usage.zig");
const hatch_style = @import("hatch_style.zig");
const pen_style = @import("pen_style.zig");

pub const fixed_size = 24;

pub const LogPenEx = struct {
    style: pen_style.Value,
    width: u32,
    brush_style: brush_style.Style,
    color_raw: u32,
    color: ?color_ref.ColorRef,
    color_usage_value: ?color_usage.Usage,
    brush_hatch_raw: u32,
    standard_hatch: ?hatch_style.Standard,
    cosmetic_hatch: ?hatch_style.Cosmetic,
    style_entries_count: u32,
    style_entries: []const u8,
    consumed: usize,

    pub fn styleEntry(self: LogPenEx, index: usize) !u32 {
        if (index >= self.style_entries_count) return error.EmfPenStyleEntryOutOfBounds;
        return std.mem.readInt(u32, self.style_entries[index * 4 ..][0..4], .little);
    }
};

pub fn parsePrefix(bytes: []const u8) !LogPenEx {
    if (bytes.len < fixed_size) return error.TruncatedEmfLogPenEx;
    const style = try pen_style.parse(std.mem.readInt(u32, bytes[0..4], .little));
    const width = std.mem.readInt(u32, bytes[4..8], .little);
    if (style.pen_type == .cosmetic and width != 1) return error.InvalidEmfCosmeticPenWidth;

    const brush = try brush_style.parse(std.mem.readInt(u32, bytes[8..12], .little));
    switch (brush) {
        .solid, .hatched => {},
        .null => if (style.line != 5) return error.InvalidEmfNullPenBrushLineStyle,
        .pattern, .dib_pattern, .dib_pattern_pt => if (style.pen_type == .geometric)
            return error.InvalidEmfGeometricPenBrushStyle,
        else => return error.UnsupportedEmfLogPenExBrushStyle,
    }

    const color_raw = std.mem.readInt(u32, bytes[12..16], .little);
    const color = switch (brush) {
        .solid, .hatched => try color_ref.parse(bytes[12..16], .specified_zero),
        else => null,
    };
    const usage = switch (brush) {
        .pattern, .dib_pattern, .dib_pattern_pt => try color_usage.parseLowWord(color_raw),
        else => null,
    };
    const hatch_raw = std.mem.readInt(u32, bytes[16..20], .little);
    var standard_hatch: ?hatch_style.Standard = null;
    var cosmetic_hatch: ?hatch_style.Cosmetic = null;
    if (brush == .hatched) {
        if (style.pen_type == .geometric) {
            standard_hatch = try hatch_style.parseStandard(hatch_raw);
        } else {
            cosmetic_hatch = try hatch_style.parseCosmetic(hatch_raw);
        }
    }

    const count = std.mem.readInt(u32, bytes[20..24], .little);
    const entries_bytes = @as(u64, count) * 4;
    const consumed_u64 = fixed_size + entries_bytes;
    if (consumed_u64 > std.math.maxInt(usize)) return error.EmfPenStyleEntriesTooLarge;
    const consumed: usize = @intCast(consumed_u64);
    if (consumed > bytes.len) return error.TruncatedEmfPenStyleEntries;
    return .{
        .style = style,
        .width = width,
        .brush_style = brush,
        .color_raw = color_raw,
        .color = color,
        .color_usage_value = usage,
        .brush_hatch_raw = hatch_raw,
        .standard_hatch = standard_hatch,
        .cosmetic_hatch = cosmetic_hatch,
        .style_entries_count = count,
        .style_entries = bytes[fixed_size..consumed],
        .consumed = consumed,
    };
}

test "LogPenEx parses user style entries without consuming following bytes" {
    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[0..4], 0x00010007, .little);
    std.mem.writeInt(u32, bytes[4..8], 9, .little);
    std.mem.writeInt(u32, bytes[20..24], 2, .little);
    std.mem.writeInt(u32, bytes[24..28], 3, .little);
    std.mem.writeInt(u32, bytes[28..32], 4, .little);
    @memset(bytes[32..], 0xaa);
    const value = try parsePrefix(&bytes);
    try std.testing.expectEqual(@as(usize, 32), value.consumed);
    try std.testing.expectEqual(@as(u32, 3), try value.styleEntry(0));
    try std.testing.expectEqual(@as(u32, 4), try value.styleEntry(1));
    try std.testing.expectError(error.EmfPenStyleEntryOutOfBounds, value.styleEntry(2));
}

test "LogPenEx validates brush relationships and interpreted fields only" {
    var bytes = [_]u8{0} ** fixed_size;
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    bytes[12..16].* = .{ 1, 2, 3, 0 };
    const solid = try parsePrefix(&bytes);
    try std.testing.expectEqual(@as(u32, 0x00030201), solid.color.?.raw);

    std.mem.writeInt(u32, bytes[0..4], 5, .little);
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    bytes[15] = 0xff;
    _ = try parsePrefix(&bytes);

    std.mem.writeInt(u32, bytes[0..4], 0, .little);
    std.mem.writeInt(u32, bytes[8..12], 2, .little);
    bytes[15] = 0;
    std.mem.writeInt(u32, bytes[16..20], 8, .little);
    const cosmetic = try parsePrefix(&bytes);
    try std.testing.expectEqual(@as(?hatch_style.Cosmetic, .solid_text_color), cosmetic.cosmetic_hatch);

    std.mem.writeInt(u32, bytes[0..4], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[4..8], 7, .little);
    std.mem.writeInt(u32, bytes[16..20], 5, .little);
    const geometric = try parsePrefix(&bytes);
    try std.testing.expectEqual(@as(?hatch_style.Standard, .diagonal_cross), geometric.standard_hatch);
}

test "LogPenEx rejects every bounded relationship violation" {
    var bytes = [_]u8{0} ** fixed_size;
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    for (0..fixed_size) |cut| try std.testing.expectError(error.TruncatedEmfLogPenEx, parsePrefix(bytes[0..cut]));
    std.mem.writeInt(u32, bytes[20..24], 1, .little);
    try std.testing.expectError(error.TruncatedEmfPenStyleEntries, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[20..24], 0, .little);

    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmfNullPenBrushLineStyle, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[0..4], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[4..8], 2, .little);
    std.mem.writeInt(u32, bytes[8..12], 3, .little);
    try std.testing.expectError(error.InvalidEmfGeometricPenBrushStyle, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[8..12], 4, .little);
    try std.testing.expectError(error.UnsupportedEmfLogPenExBrushStyle, parsePrefix(&bytes));

    std.mem.writeInt(u32, bytes[0..4], 0, .little);
    std.mem.writeInt(u32, bytes[4..8], 0, .little);
    std.mem.writeInt(u32, bytes[8..12], 0, .little);
    try std.testing.expectError(error.InvalidEmfCosmeticPenWidth, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    bytes[15] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parsePrefix(&bytes));
    bytes[15] = 0;
    std.mem.writeInt(u32, bytes[8..12], 2, .little);
    std.mem.writeInt(u32, bytes[16..20], 5, .little);
    try std.testing.expectError(error.UnsupportedEmfCosmeticHatchStyle, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[0..4], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[4..8], 2, .little);
    std.mem.writeInt(u32, bytes[16..20], 8, .little);
    try std.testing.expectError(error.UnsupportedEmfHatchStyle, parsePrefix(&bytes));
    std.mem.writeInt(u32, bytes[0..4], 0, .little);
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    std.mem.writeInt(u32, bytes[8..12], 3, .little);
    std.mem.writeInt(u32, bytes[12..16], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfColorUsage, parsePrefix(&bytes));
}
