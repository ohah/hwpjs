//! Observed 17-byte section extension. Unknown fields remain borrowed raw bytes.
const Reader = @import("../../binary/reader.zig").Reader;
pub const TextDirection = enum { HORIZONTAL, VERTICAL, VERTICALALL };

pub const View = struct {
    leading_count_raw: u32,
    memo_shape_id_ref: u16,
    flags_raw: u16,
    text_direction_raw: u3,
    text_direction: ?TextDirection,
    text_vertical_width_head: bool,
    unknown_flags: u16,
    line_number_restart_raw: u8,
    line_number_count_by: u16,
    line_number_distance_raw: u32,
    line_number_start: u16,
    trailing_raw: []const u8,
};

/// Only this exact observed wire profile is identified; other lengths stay opaque.
pub fn observed(bytes: []const u8) !?View {
    if (bytes.len != 17) return null;
    var reader: Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    const memo = try reader.readInt(u16);
    const trailing = bytes[reader.offset..];
    const flags = try reader.readInt(u16);
    const direction: u3 = @intCast((flags >> 1) & 7);
    return .{
        .leading_count_raw = count,
        .memo_shape_id_ref = memo,
        .flags_raw = flags,
        .text_direction_raw = direction,
        .text_direction = switch (direction) {
            0 => .HORIZONTAL,
            1 => .VERTICAL,
            2 => .VERTICALALL,
            else => null,
        },
        .text_vertical_width_head = flags & 0x10 != 0,
        .unknown_flags = flags & ~@as(u16, 0x1e),
        .line_number_restart_raw = try reader.readInt(u8),
        .line_number_count_by = try reader.readInt(u16),
        .line_number_distance_raw = try reader.readInt(u32),
        .line_number_start = try reader.readInt(u16),
        .trailing_raw = trailing,
    };
}

test "observed section extension separates memo reference and preserves unknown bytes" {
    const std = @import("std");
    const bytes = [_]u8{ 0x78, 0x56, 0x34, 0x12, 0x34, 0x12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };
    const view = (try observed(&bytes)).?;
    try std.testing.expectEqual(@as(u32, 0x12345678), view.leading_count_raw);
    try std.testing.expectEqual(@as(u16, 0x1234), view.memo_shape_id_ref);
    try std.testing.expectEqual(@as(u16, 0x0201), view.flags_raw);
    try std.testing.expectEqual(@as(u8, 3), view.line_number_restart_raw);
    try std.testing.expectEqual(@as(u16, 0x0504), view.line_number_count_by);
    try std.testing.expectEqual(@as(u32, 0x09080706), view.line_number_distance_raw);
    try std.testing.expectEqual(@as(u16, 0x0b0a), view.line_number_start);
    try std.testing.expectEqualSlices(u8, bytes[6..], view.trailing_raw);
    try std.testing.expect(view.trailing_raw.ptr == bytes[6..].ptr);
    for (0..bytes.len) |length| try std.testing.expectEqual(@as(?View, null), try observed(bytes[0..length]));
    const longer: [18]u8 = @splat(0);
    try std.testing.expectEqual(@as(?View, null), try observed(&longer));
}

test "observed section extension follows the version dependent language boundary" {
    const std = @import("std");
    const Definition = @import("section_def.zig").Definition;
    var bytes: [43]u8 = @splat(0);
    bytes[24] = 0x34;
    bytes[25] = 0x12;
    bytes[30] = 1;
    const modern = try Definition.parse(&bytes, .{ .raw = 0x05000105 });
    try std.testing.expectEqual(@as(?u16, 0x1234), modern.language);
    try std.testing.expectEqual(@as(u16, 1), modern.observed_extension.?.memo_shape_id_ref);
    try std.testing.expect(modern.extra.ptr == bytes[26..].ptr);
    const old = try Definition.parse(&bytes, .{ .raw = 0x05000104 });
    try std.testing.expectEqual(@as(?u16, null), old.language);
    try std.testing.expectEqual(@as(usize, 19), old.extra.len);
    try std.testing.expectEqual(@as(?View, null), old.observed_extension);
    const old_same_length = try Definition.parse(bytes[0..41], .{ .raw = 0x05000104 });
    try std.testing.expectEqual(@as(usize, 17), old_same_length.extra.len);
    try std.testing.expectEqual(@as(?View, null), old_same_length.observed_extension);
}

test "observed software section fixture prefix retains the memo shape reference" {
    const std = @import("std");
    const wire = "000000006e0400000000401f00000100000000000000000000000000000001000000000000000000000000";
    var bytes: [43]u8 = undefined;
    _ = try std.fmt.hexToBytes(&bytes, wire);
    const section = try @import("section_def.zig").Definition.parse(&bytes, .{ .raw = 0x05010100 });
    const view = section.observed_extension.?;
    try std.testing.expectEqual(@as(usize, 17), section.extra.len);
    try std.testing.expectEqual(@as(u32, 0), view.leading_count_raw);
    try std.testing.expectEqual(@as(u16, 1), view.memo_shape_id_ref);
    try std.testing.expectEqualSlices(u8, &@as([11]u8, @splat(0)), view.trailing_raw);
}

test "observed section extension retains all high bits and zero values without defaults" {
    const std = @import("std");
    for ([_]u8{ 0, 255 }) |byte| {
        const bytes: [17]u8 = @splat(byte);
        const view = (try observed(&bytes)).?;
        const short: u16 = if (byte == 0) 0 else 65535;
        const word: u32 = if (byte == 0) 0 else 0xffffffff;
        try std.testing.expectEqual(word, view.leading_count_raw);
        try std.testing.expectEqual(short, view.memo_shape_id_ref);
        try std.testing.expectEqual(short, view.flags_raw);
        try std.testing.expectEqual(byte, view.line_number_restart_raw);
        try std.testing.expectEqual(short, view.line_number_count_by);
        try std.testing.expectEqual(word, view.line_number_distance_raw);
        try std.testing.expectEqual(short, view.line_number_start);
        try std.testing.expectEqualSlices(u8, bytes[6..], view.trailing_raw);
    }
}

test "observed section directions preserve reserved enums width flag and unknown neighbors" {
    const std = @import("std");
    for (0..8) |direction| for ([_]bool{ false, true }) |width_head| {
        var bytes: [17]u8 = @splat(0);
        const flags = @as(u16, 0xa001) | (@as(u16, @intCast(direction)) << 1) | (if (width_head) @as(u16, 0x10) else 0);
        std.mem.writeInt(u16, bytes[6..8], flags, .little);
        const view = (try observed(&bytes)).?;
        try std.testing.expectEqual(flags, view.flags_raw);
        try std.testing.expectEqual(@as(u3, @intCast(direction)), view.text_direction_raw);
        try std.testing.expectEqual(width_head, view.text_vertical_width_head);
        try std.testing.expectEqual(@as(u16, 0xa001), view.unknown_flags);
        try std.testing.expectEqual(switch (direction) {
            0 => @as(?TextDirection, .HORIZONTAL),
            1 => @as(?TextDirection, .VERTICAL),
            2 => @as(?TextDirection, .VERTICALALL),
            else => @as(?TextDirection, null),
        }, view.text_direction);
        try std.testing.expectEqualSlices(u8, bytes[6..], view.trailing_raw);
    };
}
