//! HWP5 specification table 134. Pure interpretation of retained raw flags.
//! This opt-in view does not change record parsing, wire snapshots or layout.
pub const Kind = enum { footnote, endnote };
pub const FootnotePlacement = enum { each_column, across_columns, rightmost_column };
pub const EndnotePlacement = enum { document_end, section_end };
pub const Placement = union(Kind) { footnote: FootnotePlacement, endnote: EndnotePlacement };
pub const Numbering = enum { continue_previous, restart_section, restart_page };
pub const Attributes = struct {
    /// Unknown number-shape octets remain raw; no invented fallback glyph.
    number_kind_raw: u8,
    placement: Placement,
    numbering: Numbering,
    /// Table 134 assigns bit 12 to footnotes only. Endnotes keep it opaque.
    number_superscript: ?bool,
    beneath_text: bool,
    uninterpreted_flags: u32,
};
pub fn numberKind(flags: u32) u8 {
    return @truncate(flags);
}
pub fn placementRaw(flags: u32) u2 {
    return @truncate(flags >> 8);
}
pub fn numberingRaw(flags: u32) u2 {
    return @truncate(flags >> 10);
}
pub fn decode(flags: u32, kind: Kind) !Attributes {
    const placement: Placement = switch (kind) {
        .footnote => .{ .footnote = switch (placementRaw(flags)) {
            0 => .each_column,
            1 => .across_columns,
            2 => .rightmost_column,
            else => return error.UnsupportedNotePlacement,
        } },
        .endnote => .{ .endnote = switch (placementRaw(flags)) {
            0 => .document_end,
            1 => .section_end,
            else => return error.UnsupportedNotePlacement,
        } },
    };
    const numbering: Numbering = switch (numberingRaw(flags)) {
        0 => .continue_previous,
        1 => .restart_section,
        2 => if (kind == .footnote) .restart_page else return error.UnsupportedNoteNumbering,
        else => return error.UnsupportedNoteNumbering,
    };
    const known_mask: u32 = if (kind == .footnote) 0x00003fff else 0x00002fff;
    return .{
        .number_kind_raw = numberKind(flags),
        .placement = placement,
        .numbering = numbering,
        .number_superscript = if (kind == .footnote) flags & (1 << 12) != 0 else null,
        .beneath_text = flags & (1 << 13) != 0,
        .uninterpreted_flags = flags & ~known_mask,
    };
}
