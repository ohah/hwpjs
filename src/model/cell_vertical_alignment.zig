//! Only explicit editor values; unknown source values stay in the format witness.
const std = @import("std");
pub const Alignment = enum(u8) { top = 0, center = 1, bottom = 2 };
pub fn fromRaw(raw: u32) ?Alignment {
    return switch (raw) {
        0 => .top,
        1 => .center,
        2 => .bottom,
        else => null,
    };
}
pub fn fromText(raw: []const u8) ?Alignment {
    for (std.enums.values(Alignment)) |value| if (std.mem.eql(u8, raw, text(value))) return value;
    return null;
}
pub fn text(value: Alignment) []const u8 {
    return switch (value) {
        .top => "TOP",
        .center => "CENTER",
        .bottom => "BOTTOM",
    };
}
