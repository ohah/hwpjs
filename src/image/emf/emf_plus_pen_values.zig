pub const DashedLineCapType = enum(i32) { flat = 0, round = 2, triangle = 3 };
pub const LineStyle = enum(i32) { solid = 0, dash = 1, dot = 2, dash_dot = 3, dash_dot_dot = 4, custom = 5 };
pub const PenAlignment = enum(i32) { center = 0, inset = 1, left = 2, outset = 3, right = 4 };

pub const PenDataFlags = packed struct(u32) {
    transform: bool,
    start_cap: bool,
    end_cap: bool,
    join: bool,
    miter_limit: bool,
    line_style: bool,
    dashed_line_cap: bool,
    dashed_line_offset: bool,
    dashed_line: bool,
    non_center: bool,
    compound_line: bool,
    custom_start_cap: bool,
    custom_end_cap: bool,
    reserved: u19,

    pub fn parse(bits: u32) !PenDataFlags {
        const value: PenDataFlags = @bitCast(bits);
        if (value.reserved != 0) return error.InvalidEmfPlusPenDataFlags;
        return value;
    }

    pub fn raw(self: PenDataFlags) u32 {
        return @bitCast(self);
    }
};

pub fn dashedLineCapType(raw: i32) !DashedLineCapType {
    return switch (raw) {
        0 => .flat,
        2 => .round,
        3 => .triangle,
        else => error.InvalidEmfPlusDashedLineCapType,
    };
}

pub fn lineStyle(raw: i32) !LineStyle {
    return switch (raw) {
        0 => .solid,
        1 => .dash,
        2 => .dot,
        3 => .dash_dot,
        4 => .dash_dot_dot,
        5 => .custom,
        else => error.InvalidEmfPlusLineStyle,
    };
}

pub fn penAlignment(raw: i32) !PenAlignment {
    return switch (raw) {
        0 => .center,
        1 => .inset,
        2 => .left,
        3 => .outset,
        4 => .right,
        else => error.InvalidEmfPlusPenAlignment,
    };
}

test "EMF+ pen value domains reject gaps and reserved flag bits" {
    const std = @import("std");
    try std.testing.expectEqual(DashedLineCapType.round, try dashedLineCapType(2));
    try std.testing.expectError(error.InvalidEmfPlusDashedLineCapType, dashedLineCapType(1));
    try std.testing.expectEqual(LineStyle.custom, try lineStyle(5));
    try std.testing.expectError(error.InvalidEmfPlusLineStyle, lineStyle(6));
    try std.testing.expectEqual(PenAlignment.right, try penAlignment(4));
    try std.testing.expectError(error.InvalidEmfPlusPenAlignment, penAlignment(-1));
    const flags = try PenDataFlags.parse(0x1fff);
    try std.testing.expectEqual(@as(u32, 0x1fff), flags.raw());
    try std.testing.expectError(error.InvalidEmfPlusPenDataFlags, PenDataFlags.parse(0x2000));
}
