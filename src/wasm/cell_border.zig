//! Scalar ABI admission; Native cell membership and COW stay in the format sessions.
const common = @import("../model/border_fill_patch.zig");
pub const Value = struct { edges: u8, style: common.Style, width: u16, color: u32 };

pub fn parse(edges: u32, style: u32, width: u32, color: u32) !Value {
    if (edges == 0 or edges > 15) return error.InvalidCellBorderEdges;
    const line: common.Style = switch (style) {
        0 => .NONE,
        1 => .SOLID,
        2 => .DOUBLE_SLIM,
        else => return error.UnsupportedCellBorderStyle,
    };
    if (width > 65535) return error.UnsupportedBorderWidth;
    _ = try common.widthCode(@intCast(width));
    try @import("../model/rgb_color.zig").validate(color);
    return .{ .edges = @intCast(edges), .style = line, .width = @intCast(width), .color = color };
}

test "cell border ABI accepts only exact mask style width and RGB domains" {
    const t = @import("std").testing;
    for (common.widths) |width| {
        const value = try parse(15, 2, width, 0);
        try t.expectEqual(common.Style.DOUBLE_SLIM, value.style);
        try t.expectEqual(width, value.width);
        try t.expectEqual(@as(u32, 0), value.color);
    }
    try t.expectError(error.InvalidCellBorderEdges, parse(0, 1, 10, 0));
    try t.expectError(error.InvalidCellBorderEdges, parse(16, 1, 10, 0));
    // Raw HWP5 DOUBLE_SLIM=8 must not be mistaken for the public ABI code2.
    try t.expectError(error.UnsupportedCellBorderStyle, parse(1, 8, 10, 0));
    try t.expectError(error.UnsupportedBorderWidth, parse(1, 1, 11, 0));
    try t.expectError(error.UnsupportedBorderWidth, parse(1, 1, 0x1000a, 0));
    try t.expectError(error.InvalidCharacterColor, parse(1, 1, 10, 0x1000000));
}
