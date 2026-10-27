//! 공통 선모양 intent. NONE은 활성 상태와 분리하여 받지 않습니다.
const std = @import("std");
pub const Kind = enum { SOLID, DASH, DOT, DASH_DOT, DASH_DOT_DOT, LONG_DASH, CIRCLE, DOUBLE_SLIM, SLIM_THICK, THICK_SLIM, SLIM_THICK_SLIM, WAVE, DOUBLEWAVE, THICK3D, THICKREV3D, @"3D", REV3D };
pub fn hwp5(kind: Kind) u4 {
    return @intCast(@backingInt(kind));
}
pub fn fromHwp5(raw: u4) ?Kind {
    return @as(Kind, @fromBackingInt(raw));
}
pub fn fromXml(raw: []const u8, strike: bool) ?Kind {
    const kind = std.meta.stringToEnum(Kind, std.mem.trim(u8, raw, " \t\r\n")) orelse return null;
    _ = strike;
    return kind;
}
