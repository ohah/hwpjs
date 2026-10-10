//! Narrow PARA_HEADER mask patch; unrelated control bits remain raw source data.
const std = @import("std");
const Token = @import("../../model/document.zig").Token;
const Header = @import("../body/paragraph_header.zig").Header;
const bit: u32 = 1 << 10;

pub fn write(header: []u8, tokens: []const Token) !void {
    if (header.len < Header.control_mask_offset + 4) return error.UnexpectedEnd;
    var present = false;
    for (tokens) |token| {
        if (token.kind != .control) continue;
        if (token.raw.len < 2) return error.InvalidTextSize;
        if (std.mem.readInt(u16, token.raw[0..2], .little) != 10) continue;
        if (token.raw.len != 2) return error.InvalidControlSize;
        present = true;
    }
    const field = header[Header.control_mask_offset..][0..4];
    const original = std.mem.readInt(u32, field, .little);
    std.mem.writeInt(u32, field, (original & ~bit) | (if (present) bit else 0), .little);
}

test "line break mask patches only bit ten and refuses malformed input atomically" {
    var header: [28]u8 = @splat(0xa5);
    const before = header;
    var raw = [_]u8{ 10, 0 };
    const token: Token = .{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &raw };
    try write(&header, &.{token});
    try std.testing.expectEqual(@as(u32, 0xa5a5a5a5 | bit), std.mem.readInt(u32, header[4..8], .little));
    try std.testing.expectEqualSlices(u8, before[0..4], header[0..4]);
    try std.testing.expectEqualSlices(u8, before[8..], header[8..]);
    try write(&header, &.{});
    try std.testing.expectEqual(@as(u32, 0xa5a5a5a5 & ~bit), std.mem.readInt(u32, header[4..8], .little));
    const unchanged = header;
    var malformed = token;
    var invalid = [_]u8{ 10, 0, 0, 0 };
    malformed.raw = &invalid;
    try std.testing.expectError(error.InvalidControlSize, write(&header, &.{malformed}));
    try std.testing.expectEqualSlices(u8, &unchanged, &header);
    try std.testing.expectError(error.UnexpectedEnd, write(header[0..7], &.{token}));
}
