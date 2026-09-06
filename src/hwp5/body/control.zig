/// Official HWP5 section 3.2.3 table 6, including reserved code widths.
pub const Kind = enum { character, inline_control, extended };
pub fn kind(code: u16) ?Kind {
    return switch (code) {
        0, 10, 13, 24...31 => .character,
        4...9, 19, 20 => .inline_control,
        1...3, 11, 12, 14...18, 21...23 => .extended,
        else => null,
    };
}
pub fn units(k: Kind) usize {
    return if (k == .character) 1 else 8;
}
pub const Control = struct {
    code: u16,
    kind: Kind,
    /// 12 raw bytes for inline/extended, empty for a character control.
    /// These are not memory pointers and are never dereferenced.
    data: []const u8,
    closing_code: ?u16,
};
