//! Effective decorations only; source attributes and colors remain unchanged.
pub fn legacyStrike(underline: u2, strike: u3) bool {
    return underline == 2 and strike == 0;
}
pub const View = struct {
    strike_enabled: ?bool,
    strike_style: u4,
    strike_color: ?u32,
    underline_kind: u2,
};
pub fn resolve(shape: anytype) View {
    if (legacyStrike(shape.underline_kind_raw, shape.strike_kind_raw)) return .{
        .strike_enabled = true,
        .strike_style = shape.underline_style_raw,
        .strike_color = shape.underline_color_raw,
        .underline_kind = 0,
    };
    return .{
        .strike_enabled = switch (shape.strike_kind_raw) {
            0 => false,
            1 => true,
            else => null,
        },
        .strike_style = shape.strike_style_raw,
        .strike_color = shape.strike_color_raw,
        .underline_kind = shape.underline_kind_raw,
    };
}
